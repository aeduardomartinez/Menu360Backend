import { IOrderRepository, OrderQueryOptions } from '../../domain/repositories/IOrderRepository';
import { Order, OrderStatus } from '../../domain/models/Order';
import { FinancialRecordService } from './FinancialRecordService';

import { IProductRepository } from '../../domain/repositories/IProductRepository';
import { ClientService } from './ClientService';
import { modifierRepository } from '../../infrastructure/repositories/PrismaModifierRepository';
import { isSameBusinessDay, startOfCurrentBusinessDay } from '../../shared/businessDay';

export class OrderService {
  constructor(
    private orderRepository: IOrderRepository,
    private productRepository?: IProductRepository,
    private financialRecordService?: FinancialRecordService,
    private clientService?: ClientService
  ) {}

  async createOrder(orderData: Omit<Order, 'id' | 'createdAt' | 'updatedAt' | 'status'> & { boxId?: string }): Promise<Order> {
    const isPOS = orderData.origin === 'POS';
    const isDelivery = orderData.deliveryType === 'DELIVERY';
    const isDineIn = orderData.deliveryType === 'DINE_IN';
    
    // Todos los pedidos inician en estado PENDING, independientemente de su origen.
    // Esto permite que los pedidos Para Llevar (PICKUP) y a Domicilio (DELIVERY)
    // fluyan correctamente a través de los estados (PENDING -> PREPARING -> READY -> DELIVERED).
    const status = 'PENDING';

    const lastOrderNumber = await this.orderRepository.findLastOrderNumber(orderData.restaurantId);
    const nextOrderNumber = lastOrderNumber + 1;

    // Omit boxId and clientBirthDate before saving to DB
    const { boxId, clientBirthDate, ...dbData } = orderData as any;

    // Zero-Trust: recalculamos el precio de cada ítem contra la base de datos
    // (precio base o variante, más el valor real de cada modificador seleccionado)
    // para que nadie pueda manipular el total enviando un unitPrice/subtotal falso
    // desde el navegador. Lo único que seguimos sin poder verificar server-side es
    // el costo de domicilio y los descuentos de cupón, que hoy viajan mezclados
    // dentro de totalAmount sin desglosar; por eso conservamos esa diferencia tal
    // cual venga, y solo corregimos la parte de los productos.
    let calculatedTotal = orderData.totalAmount;
    if (this.productRepository) {
      const clientDeclaredItemsTotal = orderData.items.reduce(
        (sum, item: any) => sum + (Number(item.subtotal) || 0),
        0
      );

      const modifierPriceCache = new Map<string, Map<string, number>>();
      const getModifierPriceMap = async (productId: string) => {
        if (!modifierPriceCache.has(productId)) {
          const categories = await modifierRepository.findByProduct(productId);
          const priceMap = new Map<string, number>();
          for (const category of categories) {
            for (const option of category.options || []) {
              priceMap.set(option.id, option.extraPrice || 0);
            }
          }
          modifierPriceCache.set(productId, priceMap);
        }
        return modifierPriceCache.get(productId)!;
      };

      let trustedItemsTotal = 0;

      for (const item of orderData.items) {
        const productId = (item as any).productId || item.product?.id;
        if (!productId) continue;

        const product = await this.productRepository.findById(productId);
        if (product && product.restaurantId === orderData.restaurantId) {
          // Descontar inventario si aplica
          if (product.trackStock && typeof product.currentStock === 'number') {
            const quantity = (item as any).quantity || 1;
            const newStock = Math.max(0, product.currentStock - quantity);
            const isAvailable = newStock > 0;

            await this.productRepository.update(product.id, product.restaurantId, {
              currentStock: newStock,
              isAvailable: isAvailable
            });
          }

          // Precio base verificado: el de la variante seleccionada (si existe y
          // sigue existiendo en el producto real) o el precio base del producto.
          const selectedVariantId = (item as any).selectedVariant?.id;
          const verifiedVariant = selectedVariantId
            ? (product as any).variants?.find((v: any) => v.id === selectedVariantId)
            : undefined;
          const trustedBasePrice = verifiedVariant ? verifiedVariant.price : product.price;

          // Modificadores verificados: solo se cobra el extraPrice real guardado
          // en la base de datos para ese producto; un id de modificador que no
          // exista o no aplique a este producto simplemente no suma nada.
          const modifierPriceMap = await getModifierPriceMap(productId);
          const selectedModifiers = (item as any).selectedModifiers || [];
          const trustedModifiersTotal = selectedModifiers.reduce((sum: number, mod: any) => {
            const optionId = mod?.option?.id;
            return sum + (optionId && modifierPriceMap.has(optionId) ? modifierPriceMap.get(optionId)! : 0);
          }, 0);

          const quantity = (item as any).quantity || 1;
          const trustedUnitPrice = trustedBasePrice + trustedModifiersTotal;
          const trustedSubtotal = trustedUnitPrice * quantity;

          // Sobrescribimos lo que haya mandado el cliente con el valor verificado.
          (item as any).unitPrice = trustedUnitPrice;
          (item as any).subtotal = trustedSubtotal;
          trustedItemsTotal += trustedSubtotal;

          // Sólo inyectamos la info del producto por seguridad.
          if (!item.product) {
            item.product = product as any; // Asegurar que el objeto product exista en el item
          }
        }
      }

      // El resto del total (domicilio, propina, descuento de cupón...) no lo
      // modelamos todavía del lado del servidor, así que preservamos esa
      // diferencia tal cual la declaró el cliente, pero sobre el total YA
      // corregido de los productos — y nunca dejamos que el total quede negativo.
      const nonItemsAmount = orderData.totalAmount - clientDeclaredItemsTotal;
      calculatedTotal = Math.max(0, Math.round(trustedItemsTotal + nonItemsAmount));

      if (Math.abs(calculatedTotal - orderData.totalAmount) > 1) {
        console.warn(
          `[OrderService] Total corregido para un pedido de ${orderData.restaurantId}: ` +
          `el cliente envió $${orderData.totalAmount} y el valor verificado de los productos fue $${calculatedTotal}.`
        );
      }
    }

    const order = await this.orderRepository.create({
      ...dbData,
      totalAmount: calculatedTotal,
      status,
      orderNumber: nextOrderNumber,
    });

    // CRM: Auto-guardar o actualizar el cliente si proveyó teléfono
    if (order.clientPhone && this.clientService) {
      try {
        await this.clientService.upsertClientByPhone(order.restaurantId, order.clientPhone, {
          name: order.clientName,
          address: order.deliveryAddress,
          neighborhood: order.neighborhood,
          city: order.city,
          birthDate: clientBirthDate ? new Date(clientBirthDate) : undefined
        });
      } catch (err) {
        console.error('Error auto-upserting client in CRM:', err);
      }
    }

    // Facturamos automáticamente las órdenes del POS que se cobran en el
    // momento (mesa y para llevar): ahí el cliente está enfrente y paga antes
    // de irse, así que la venta es real desde que se crea el pedido.
    //
    // Los DOMICILIOS quedan fuera, sin importar que se hayan tomado en caja:
    // en un domicilio la plata todavía no ha entrado. O el cliente transfiere
    // y hay que verificar con el banco que llegó, o paga en efectivo cuando
    // el domiciliario le entrega. Facturarlos al crearlos inflaba las ventas
    // del día con pedidos que podían terminar rechazados o sin cobrar, y
    // dejaba al cajero sin el paso de "Confirmar Transferencia". Ahora siguen
    // el mismo camino que un domicilio de la web: van al historial sin
    // facturar y se facturan al pasarlos a "Listo para entrega" (ver
    // updateOrderStatus y needsBillingAtReady en OrderTableRow).
    if (isPOS && !isDelivery && (order.paymentMethod as any) !== 'PENDING' && (order.paymentMethod as any) !== 'Pendiente' && this.financialRecordService) {
      await this.financialRecordService.createRecord({
        restaurantId: order.restaurantId,
        type: 'INCOME',
        amount: order.totalAmount,
        category: 'Venta PDV',
        paymentMethod: order.paymentMethod,
        boxId: (orderData as any).boxId,
        boxName: 'Caja principal',
        date: new Date().toISOString(),
        description: `Cobro de pedido PDV #${String(order.orderNumber).padStart(4, '0')}`
      });
    }

    return order;
  }

  async getOrderById(id: string): Promise<Order | null> {
    return this.orderRepository.findById(id);
  }

  async getByOrderNumber(orderNumber: number, restaurantId: string): Promise<Order | null> {
    return this.orderRepository.findByOrderNumber(orderNumber, restaurantId);
  }

  // Normaliza a solo dígitos y se queda con los últimos 10 (celular colombiano),
  // así "3001234567", "+57 300 123 4567" y "300-123-4567" comparan igual.
  private normalizePhone(phone: string): string {
    return (phone || '').replace(/\D/g, '').slice(-10);
  }

  // Búsqueda pública por número de pedido (secuencial y por tanto adivinable):
  // solo se devuelve el pedido si el teléfono coincide con el registrado, para
  // que nadie pueda recorrer #1, #2, #3... y ver los datos de otros clientes.
  async getOrderByNumberAndPhone(orderNumber: number, restaurantId: string, phone: string): Promise<Order | null> {
    if (!restaurantId || !phone) return null;
    const order = await this.orderRepository.findByOrderNumber(orderNumber, restaurantId);
    if (!order) return null;

    const normalizedInput = this.normalizePhone(phone);
    const normalizedStored = this.normalizePhone(order.clientPhone || '');
    if (!normalizedInput || normalizedInput !== normalizedStored) return null;

    return order;
  }

  async getAllOrders(restaurantId?: string, options?: OrderQueryOptions): Promise<Order[]> {
    return this.orderRepository.findAll(restaurantId, options);
  }

  async updateOrderStatus(id: string, restaurantId: string, newStatus: OrderStatus, paymentMethod?: string, boxId?: string, cashReceived?: number): Promise<Order | null> {
    const existingOrder = await this.orderRepository.findById(id);
    if (!existingOrder || existingOrder.restaurantId !== restaurantId) return null;

    const oldStatus = existingOrder.status;

    // Una vez el domiciliario ya salió con el pedido (SENT = "En camino") o ya
    // llegó (ARRIVED), no tiene sentido devolverlo a "En preparación" ni a
    // "Listo para entregar" — el domiciliario ya tiene el pedido físico en la
    // calle. El frontend ya deshabilita ese botón (ver driverAssignmentLocked
    // en OrderTableRow); este chequeo es el respaldo del lado del servidor.
    // Sí se permite seguir avanzando (a DELIVERED) o cancelar.
    if (
      existingOrder.deliveryType === 'DELIVERY' &&
      ['SENT', 'ARRIVED'].includes(existingOrder.status) &&
      ['PENDING', 'PREPARING', 'READY'].includes(newStatus)
    ) {
      throw new Error('NO_STATUS_CHANGE_IN_TRANSIT|El domiciliario ya salió con este pedido: no se puede volver a "En preparación" ni a "Listo para entregar".');
    }

    // Un pedido del POS con medio de pago ya definido se factura desde el
    // momento en que se crea (ver createOrder), sin importar el estado por
    // el que pase después.
    // "Ya venía facturado desde el POS". Excluye los domicilios por la misma
    // razón que createOrder: desde este cambio un domicilio del POS nace sin
    // facturar. Si no se excluyera, el sistema creería que ya se cobró y
    // bloquearía para siempre su facturación al marcarlo "Listo para entrega".
    const wasBilledInPOS =
      existingOrder.origin === 'POS' &&
      existingOrder.deliveryType !== 'DELIVERY' &&
      (existingOrder.paymentMethod as any) !== 'PENDING' &&
      (existingOrder.paymentMethod as any) !== 'Pendiente';

    const effectivePaymentMethod = paymentMethod || existingOrder.paymentMethod;
    const isCashPayment = effectivePaymentMethod === 'Efectivo' || effectivePaymentMethod === 'CASH';
    // Si es un domicilio en efectivo y todavía no está pagado, el ingreso se
    // difiere hasta que el domiciliario entregue y el cajero confirme el
    // efectivo recibido (ver updatePaymentStatus) — no se factura aquí.
    const isUnpaidCashDelivery = !existingOrder.isPaid && isCashPayment && existingOrder.deliveryType === 'DELIVERY';

    // Facturación explícita: se acaba de pasar un medio de pago real (no
    // "Pendiente") a un pedido que todavía no estaba pagado ni facturado
    // desde el POS. Ya no dependemos de que el pedido llegue a "DELIVERED"
    // para reconocer la venta — puede pasar al facturar un domicilio al
    // marcarlo "Listo para entregar", o un pedido para llevar en cualquier
    // cambio de estado donde el cajero indique cómo se pagó.
    const isExplicitBilling = !!paymentMethod && paymentMethod !== 'PENDING' && paymentMethod !== 'Pendiente' && !existingOrder.isPaid && !wasBilledInPOS;

    // No se puede facturar (reconocer una venta nueva) sobre un pedido de un
    // día anterior: la caja de ese día ya no está disponible para recibir
    // ingresos nuevos. Esto no afecta pedidos que ya se habían facturado
    // antes (wasBilledInPOS, o los que ya llegaron pagados) ni transiciones
    // de estado que no traen un medio de pago nuevo — solo bloquea el
    // intento concreto de reconocer un ingreso fuera de su día. El barrido
    // diario (closeStaleUnbilledOrders) se encarga de cerrar esos pedidos
    // para que no se queden esperando esta facturación indefinidamente.
    if (isExplicitBilling) {
      // Se compara por JORNADA, no por día calendario: en un restaurante que
      // cierra a las 2am, facturar a la 1am un pedido tomado a las 11pm es la
      // misma jornada y debe permitirse (ver startOfBusinessDay).
      if (!isSameBusinessDay(new Date(existingOrder.createdAt), new Date())) {
        throw new Error('STALE_ORDER_NO_BILLING|No se puede facturar este pedido: es de una jornada anterior y la caja de ese día ya no admite ventas nuevas. El pedido se cerrará automáticamente sin facturarse.');
      }
    }

    // Con cuánto efectivo va a pagar el cliente. El cajero lo escribe en la
    // ventana de cobro, pero hasta ahora ese dato se quedaba solo en el recibo
    // impreso y nunca llegaba al pedido: el domiciliario abría "Mis entregas"
    // y veía "No especificado" y una devuelta de $0, así que salía sin saber
    // cuánta plata suelta llevar.
    //
    // Se guarda con la misma etiqueta "[Paga con: N]" que ya escribe el
    // checkout de la web, para que la pantalla del domiciliario la lea igual
    // venga el pedido de donde venga. Es un dato estructurado dentro de un
    // campo de texto libre, que no es ideal, pero es la convención que ya
    // existe y evita que haya dos formas de guardar lo mismo.
    let commentsToPersist: string | undefined;
    const esDomicilioEnEfectivo = existingOrder.deliveryType === 'DELIVERY' && isCashPayment;
    if (esDomicilioEnEfectivo && typeof cashReceived === 'number' && Number.isFinite(cashReceived) && cashReceived > 0) {
      const base = (existingOrder.orderComments || '')
        .replace(/\s*\[Paga con:[^\]]*\]/gi, '')
        .trimEnd();
      commentsToPersist = `${base}${base ? '\n\n' : ''}[Paga con: ${Math.round(cashReceived)}]`;
    }

    const updatedOrder = await this.orderRepository.updateStatus(id, restaurantId, newStatus, paymentMethod, commentsToPersist);
    if (!updatedOrder) return null;

    // Marcamos como pagado con el update atómico (markPaidIfUnpaid), no con
    // un simple updatePaymentStatus: así, si dos peticiones de facturación
    // casi simultáneas llegan para el mismo pedido (doble click del cajero,
    // o un reintento de red), solo la que de verdad gana la carrera obtiene
    // justMarkedPaid=true — la otra ve que ya quedó pagado y no vuelve a
    // registrar el ingreso más abajo. Antes esto se decidía solo con
    // existingOrder.isPaid (una copia leída al principio de esta función),
    // que las dos peticiones podían ver en false al mismo tiempo.
    let justMarkedPaid = false;
    if (paymentMethod && paymentMethod !== 'PENDING' && !existingOrder.isPaid && !isUnpaidCashDelivery) {
      const paidOrder = await this.orderRepository.markPaidIfUnpaid(id, restaurantId);
      if (paidOrder) {
        updatedOrder.isPaid = true;
        justMarkedPaid = true;
      }
    }

    // Reconocemos la venta en el momento en que efectivamente se factura, no
    // apenas se acepta o llega el pedido. Para domicilios en efectivo sin
    // confirmar, el ingreso sigue diferido hasta que se confirme el efectivo
    // (updatePaymentStatus más abajo en este archivo). justMarkedPaid exige
    // además que ESTA petición haya sido la que efectivamente pasó el
    // pedido de no pagado a pagado — así un pedido ya facturado nunca
    // vuelve a generar un segundo ingreso duplicado.
    if (isExplicitBilling && justMarkedPaid && !isUnpaidCashDelivery && this.financialRecordService) {
      await this.financialRecordService.createRecord({
        restaurantId: updatedOrder.restaurantId,
        type: 'INCOME',
        amount: updatedOrder.totalAmount,
        category: updatedOrder.origin === 'POS' ? 'Venta PDV' : 'Venta Web',
        paymentMethod: paymentMethod || updatedOrder.paymentMethod || 'Efectivo',
        boxName: 'Caja principal',
        boxId: boxId,
        date: new Date().toISOString(),
        description: `Cobro de pedido #${String(updatedOrder.orderNumber).padStart(4, '0')}`
      });
    }

    // Reverso de Facturación: revertimos el ingreso si el pedido termina
    // cancelado y ya se había facturado por alguno de los dos caminos
    // posibles —
    //   1) wasBilledInPOS: pedido tomado desde el POS con medio de pago ya
    //      definido desde el momento en que se creó (ver createOrder).
    //   2) existingOrder.isPaid: ya se había facturado explícitamente en una
    //      actualización de estado anterior (ver bloque de arriba), o ya se
    //      había confirmado el efectivo del domiciliario (updatePaymentStatus).
    // Si el pedido nunca llegó a facturarse (p.ej. un domicilio en efectivo
    // cancelado antes de que el domiciliario confirmara el pago), no hay
    // nada que revertir.
    if (newStatus === 'CANCELLED' && oldStatus !== 'CANCELLED' && (wasBilledInPOS || existingOrder.isPaid) && this.financialRecordService) {
      await this.financialRecordService.createRecord({
        restaurantId: updatedOrder.restaurantId,
        type: 'EXPENSE',
        amount: updatedOrder.totalAmount,
        category: 'Reverso de Venta',
        paymentMethod: 'Efectivo', // Asumimos efectivo o devolvemos a caja
        boxName: 'Caja principal',
        boxId: boxId,
        date: new Date().toISOString(),
        description: `Reverso de pedido #${String(updatedOrder.orderNumber).padStart(4, '0')}`
      });
    }

    return updatedOrder;
  }

  async revertOrder(id: string, restaurantId: string, boxId?: string): Promise<Order | null> {
    const existingOrder = await this.orderRepository.findById(id);
    if (!existingOrder || existingOrder.restaurantId !== restaurantId || existingOrder.status !== 'DELIVERED') return null;

    // Change status back to PENDING
    const updatedOrder = await this.orderRepository.updateStatus(id, restaurantId, 'PENDING');
    if (!updatedOrder) return null;

    // Register a negative financial record to balance the box
    if (this.financialRecordService) {
      await this.financialRecordService.createRecord({
        restaurantId: updatedOrder.restaurantId,
        type: 'EXPENSE',
        amount: updatedOrder.totalAmount, // This is an expense of the same amount
        category: 'ANULACIÓN',
        paymentMethod: updatedOrder.paymentMethod || 'CASH', 
        description: `Anulación de Pedido #${updatedOrder.id.substring(0,6)}`,
        boxId: boxId || 'box-1', // Fallback for backwards comp
        boxName: 'Caja principal',
        date: new Date().toISOString()
      });
    }

    return updatedOrder;
  }

  async updatePaymentStatus(id: string, restaurantId: string, isPaid: boolean, boxId?: string): Promise<Order | null> {
    if (isPaid) {
      // Igual que en updateOrderStatus: usamos el update atómico
      // (markPaidIfUnpaid) en vez de un simple updatePaymentStatus. Si el
      // pedido ya estaba pagado (por ejemplo, el cajero le da doble clic a
      // "Validar Pago" o a "Confirmar Efectivo"), markPaidIfUnpaid devuelve
      // null y NO volvemos a registrar el ingreso — así se evita la
      // duplicidad en la contabilidad.
      const order = await this.orderRepository.markPaidIfUnpaid(id, restaurantId);
      if (!order) {
        return this.orderRepository.findById(id);
      }

      // Antes esto solo registraba el ingreso en caja cuando el medio de pago
      // era efectivo — un domicilio o pedido pagado por transferencia (Nequi,
      // Bancolombia, transferencia bancaria...) que se confirmaba por este
      // mismo camino (ver "Confirmar Transferencia" / "Validar Pago" en el
      // frontend) quedaba marcado como pagado pero la venta jamás se
      // contabilizaba en caja ni en los reportes financieros. Ahora se
      // registra sin importar el medio de pago, usando el que realmente
      // tenga el pedido.
      if (this.financialRecordService) {
        await this.financialRecordService.createRecord({
          restaurantId: order.restaurantId,
          type: 'INCOME',
          amount: order.totalAmount,
          category: order.deliveryType === 'DELIVERY' ? 'Cobro Domicilio' : (order.origin === 'POS' ? 'Venta PDV' : 'Venta Web'),
          paymentMethod: order.paymentMethod || 'Efectivo',
          boxId: boxId,
          boxName: 'Caja principal',
          date: new Date().toISOString(),
          description: order.deliveryType === 'DELIVERY'
            ? `Cobro de pedido a domicilio #${String(order.orderNumber).padStart(4, '0')}`
            : `Cobro de pedido #${String(order.orderNumber).padStart(4, '0')}`
        });
      }

      return order;
    }

    return this.orderRepository.updatePaymentStatus(id, restaurantId, false);
  }

  async updateDriverConfirmedCash(id: string, restaurantId: string, confirmed: boolean): Promise<Order | null> {
    return this.orderRepository.updateDriverConfirmedCash(id, restaurantId, confirmed);
  }

  // Domicilios web pagados por transferencia: el cajero verificó con su banco
  // que el dinero llegó. A propósito NO se marca el pedido como pagado ni se
  // registra ningún ingreso todavía — la venta se reconoce cuando el pedido
  // se factura (updateOrderStatus con medio de pago, al marcarlo "Listo para
  // entrega"), no cuando se confirma el pago. Así las ventas del día nunca
  // incluyen un pedido que aún no tiene factura.
  async updateTransferConfirmed(id: string, restaurantId: string, confirmed: boolean): Promise<Order | null> {
    return this.orderRepository.updateTransferConfirmed(id, restaurantId, confirmed);
  }

  // Aceptar un pedido de la web solo confirma que el restaurante lo va a
  // hacer. A propósito NO lo pasa a "En preparación": quien cocina decide
  // cuándo empieza de verdad, y hasta ese momento el cliente debe seguir
  // viendo su pedido como "Pendiente" en el rastreo.
  async acceptOrder(id: string, restaurantId: string): Promise<Order | null> {
    return this.orderRepository.acceptOrder(id, restaurantId);
  }

  async assignDriver(id: string, restaurantId: string, driverId: string): Promise<Order | null> {
    // Una vez el domiciliario ya salió con el pedido (SENT = "En camino") o
    // ya llegó (ARRIVED), no se puede reasignar — el domiciliario original ya
    // tiene el pedido físico en la calle. El frontend ya deshabilita el botón
    // para este caso; este chequeo es el respaldo real del lado del
    // servidor, para que no dependa solo de que la pantalla lo bloquee.
    const existingOrder = await this.orderRepository.findById(id);
    if (!existingOrder || existingOrder.restaurantId !== restaurantId) return null;
    if (['SENT', 'ARRIVED'].includes(existingOrder.status)) {
      throw new Error('NO_REASSIGN_DRIVER_IN_TRANSIT|El domiciliario ya está en camino con este pedido: no se puede reasignar.');
    }

    return this.orderRepository.assignDriver(id, restaurantId, driverId);
  }

  async getDriverOrders(driverId: string, restaurantId?: string): Promise<Order[]> {
    return this.orderRepository.findByDriverId(driverId, restaurantId);
  }

  async cancelOldPendingOrders(hoursOld: number = 12): Promise<number> {
    if (this.orderRepository.cancelOldPendingOrders) {
      return this.orderRepository.cancelOldPendingOrders(hoursOld);
    }
    return 0;
  }

  // Cierra los pedidos de días anteriores que se quedaron sin facturar
  // (ver la explicación completa en IOrderRepository.closeStaleUnbilledOrders
  // y PrismaOrderRepository) — pensado para correr periódicamente (ver
  // api.ts) y así evitar que la caja de un día ya cerrado siga recibiendo
  // pedidos por facturar. El bloqueo real de la facturación en sí vive en
  // updateOrderStatus (isExplicitBilling + chequeo de día); este método solo
  // se encarga de que esos pedidos no se queden visualmente "en curso" para
  // siempre.
  async closeStaleUnbilledOrders(): Promise<{ completed: number; cancelledForDriver: number }> {
    // Corta por el inicio de la JORNADA en curso, no por la medianoche: si no,
    // este barrido (que corre cada hora) daba por abandonados a las 00:05 los
    // pedidos del turno que seguía en marcha — cancelando incluso domicilios
    // que el domiciliario ya llevaba en la calle.
    return this.orderRepository.closeStaleUnbilledOrders(startOfCurrentBusinessDay());
  }

  // Cierra los domicilios en efectivo YA ENTREGADOS de un día anterior que
  // nadie confirmó (ni el cajero desde "Confirmar Efectivo", ni el
  // domiciliario desde "Mis entregas"). closeStaleUnbilledOrders no los toca
  // porque ese método solo mira pedidos que quedaron atascados ANTES de
  // entregarse — cancelar una venta que sí se entregó sería incorrecto. Acá
  // en cambio el pedido sí se completó, así que se asume que el efectivo sí
  // se cobró y se cierra solo, registrando el ingreso correspondiente para
  // que no falte en la contabilidad del día en que realmente se vendió.
  async closeStalePendingCashDeliveries(): Promise<number> {
    // Igual que el barrido de arriba: solo toca domicilios de jornadas
    // anteriores, nunca los del turno que está corriendo.
    const candidates = await this.orderRepository.findStaleUnconfirmedCashDeliveries(startOfCurrentBusinessDay());
    let closedCount = 0;

    for (const order of candidates) {
      const closedOrder = await this.orderRepository.closeStalePendingCashDelivery(order.id, order.restaurantId);
      if (!closedOrder) continue; // Ya se había confirmado justo antes (carrera con el cajero).

      closedCount++;

      if (this.financialRecordService) {
        await this.financialRecordService.createRecord({
          restaurantId: closedOrder.restaurantId,
          type: 'INCOME',
          amount: closedOrder.totalAmount,
          category: 'Cobro Domicilio',
          paymentMethod: 'Efectivo',
          boxName: 'Caja principal',
          date: new Date().toISOString(),
          description: `Cierre automático de pedido a domicilio #${String(closedOrder.orderNumber).padStart(4, '0')} (efectivo asumido cobrado — quedó de un día anterior sin confirmar)`
        });
      }
    }

    return closedCount;
  }
}
