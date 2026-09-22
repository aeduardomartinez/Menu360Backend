import { Order, OrderStatus, OrderItem } from '../../domain/models/Order';
import { IOrderRepository, OrderQueryOptions } from '../../domain/repositories/IOrderRepository';
import { prisma } from '../db/prisma';
import { BUSINESS_DAY_START_HOUR } from '../../shared/businessDay';

export class PrismaOrderRepository implements IOrderRepository {
  async findAll(restaurantId?: string, options?: OrderQueryOptions): Promise<Order[]> {
    const restaurantFilter = restaurantId ? { restaurantId } : {};

    // Pedidos de domicilio en efectivo, ya entregados, que el cajero todavía
    // no puede cerrar porque el domiciliario no ha confirmado que trajo el
    // efectivo. Deben verse siempre, sin importar el rango de fechas, para
    // que no "desaparezcan" del panel mientras están pendientes de cobro.
    const unpaidCashDeliveredFilter = {
      status: 'DELIVERED',
      isPaid: false,
      paymentMethod: { in: ['Efectivo', 'CASH'] }
    };

    let extraFilter: any = undefined;

    const search = options?.search?.trim();
    if (search) {
      // Búsqueda: se ignora el rango de fechas y se busca en todo el
      // historial del restaurante (id, cliente, teléfono, número de pedido).
      const searchOr: any[] = [
        { id: { contains: search, mode: 'insensitive' } },
        { clientName: { contains: search, mode: 'insensitive' } },
        { clientPhone: { contains: search, mode: 'insensitive' } }
      ];
      const digitsOnly = search.replace(/\D/g, '');
      if (digitsOnly) {
        const asNumber = parseInt(digitsOnly, 10);
        if (!isNaN(asNumber)) {
          searchOr.push({ orderNumber: asNumber });
        }
      }
      extraFilter = { OR: searchOr };
    } else if (options?.startDate || options?.endDate) {
      // Las fechas que llegan son JORNADAS, no días calendario: el "18 de
      // septiembre" de un restaurante que cierra a las 2am va desde las 4:00am
      // del 18 hasta las 3:59:59am del 19 (ver shared/businessDay). Sin este
      // corrimiento, al filtrar por "hoy" a la 1am el historial se veía vacío
      // y los pedidos del turno quedaban repartidos entre dos fechas.
      const startHour = BUSINESS_DAY_START_HOUR;
      const dateRange: any = {};
      if (options.startDate) {
        dateRange.gte = new Date(`${options.startDate}T00:00:00`);
        dateRange.gte.setHours(startHour, 0, 0, 0);
      }
      if (options.endDate) {
        const end = new Date(`${options.endDate}T00:00:00`);
        end.setDate(end.getDate() + 1);
        end.setHours(startHour, 0, 0, -1); // un milisegundo antes del corte siguiente
        dateRange.lte = end;
      }
      extraFilter = { OR: [{ createdAt: dateRange }, unpaidCashDeliveredFilter] };
    }
    // Si no se pasan fechas ni búsqueda, se devuelve el historial completo
    // del restaurante (comportamiento previo, usado por Cocina y Domicilios).

    const orders = await prisma.order.findMany({
      where: extraFilter ? { AND: [restaurantFilter, extraFilter] } : restaurantFilter,
      orderBy: { createdAt: 'desc' },
      include: { table: true, waitress: true, invoices: true }
    });
    return orders.map(this.mapToOrder);
  }

  async findById(id: string): Promise<Order | null> {
    const order = await prisma.order.findUnique({ 
      where: { id },
      include: { table: true, waitress: true, invoices: true }
    });
    return order ? this.mapToOrder(order) : null;
  }

  async findByOrderNumber(orderNumber: number, restaurantId: string): Promise<Order | null> {
    const order = await prisma.order.findFirst({
      where: { orderNumber, restaurantId },
      include: { table: true, waitress: true, invoices: true }
    });
    return order ? this.mapToOrder(order) : null;
  }

  async findLastOrderNumber(restaurantId: string): Promise<number> {
    const lastOrder = await prisma.order.findFirst({
      where: { 
        restaurantId,
        orderNumber: { not: null }
      },
      orderBy: { orderNumber: 'desc' },
      select: { orderNumber: true }
    });
    return lastOrder?.orderNumber || 0;
  }

  async create(orderData: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>): Promise<Order> {
    const newOrder = await prisma.order.create({
      data: {
        restaurantId: orderData.restaurantId,
        clientName: orderData.clientName,
        clientPhone: orderData.clientPhone,
        clientDocument: orderData.clientDocument,
        items: orderData.items as any,
        totalAmount: orderData.totalAmount,
        status: orderData.status,
        paymentMethod: orderData.paymentMethod,
        isPaid: orderData.isPaid || false,
        deliveryAddress: orderData.deliveryAddress,
        deliveryType: orderData.deliveryType,
        neighborhood: orderData.neighborhood,
        city: orderData.city,
        orderComments: orderData.orderComments,
        origin: orderData.origin,
        orderNumber: orderData.orderNumber,
        tableId: orderData.tableId,
        waitressId: orderData.waitressId,
        driverId: orderData.driverId,
        driverConfirmedCash: orderData.driverConfirmedCash || false,
      },
      include: { table: true, waitress: true, invoices: true }
    });
    return this.mapToOrder(newOrder);
  }

  async updateStatus(id: string, restaurantId: string, status: OrderStatus, paymentMethod?: string, orderComments?: string): Promise<Order | null> {
    try {
      const dataToUpdate: any = { status };
      if (paymentMethod) {
        dataToUpdate.paymentMethod = paymentMethod;
      }
      // Los comentarios se reescriben solo cuando el servicio manda un valor
      // nuevo (hoy: al facturar un domicilio en efectivo, para dejar anotado
      // con cuánto paga el cliente). Si llega undefined no se tocan.
      if (orderComments !== undefined) {
        dataToUpdate.orderComments = orderComments;
      }
      
      const updated = await prisma.order.update({
        where: { id, restaurantId },
        data: dataToUpdate,
        include: { table: true, waitress: true, invoices: true }
      });
      return this.mapToOrder(updated);
    } catch (e: any) {
      console.error("Prisma updateStatus error:", e);
      return null;
    }
  }

  async updatePaymentStatus(id: string, restaurantId: string, isPaid: boolean): Promise<Order | null> {
    try {
      const updated = await prisma.order.update({
        where: { id, restaurantId },
        data: { isPaid },
        include: { table: true, waitress: true, invoices: true }
      });
      return this.mapToOrder(updated);
    } catch (e: any) {
      console.error("Prisma updatePaymentStatus error:", e);
      return null;
    }
  }

  async markPaidIfUnpaid(id: string, restaurantId: string): Promise<Order | null> {
    try {
      // updateMany con isPaid: false en el WHERE es la parte que hace esto
      // atómico: si dos peticiones llegan casi al mismo tiempo, la base de
      // datos solo deja que UNA afecte la fila (la que gane la carrera deja
      // isPaid en true y la fila ya no cumple el WHERE para la otra). La
      // llamada que no afectó ninguna fila (count === 0) sabe que el pedido
      // ya estaba pagado y no debe registrar el ingreso de nuevo.
      const result = await prisma.order.updateMany({
        where: { id, restaurantId, isPaid: false },
        data: { isPaid: true }
      });
      if (result.count === 0) return null;

      const updated = await prisma.order.findUnique({
        where: { id },
        include: { table: true, waitress: true, invoices: true }
      });
      return updated ? this.mapToOrder(updated) : null;
    } catch (e: any) {
      console.error("Prisma markPaidIfUnpaid error:", e);
      return null;
    }
  }

  async findStaleUnconfirmedCashDeliveries(beforeDate: Date): Promise<Order[]> {
    const orders = await prisma.order.findMany({
      where: {
        status: 'DELIVERED',
        isPaid: false,
        paymentMethod: { in: ['Efectivo', 'CASH'] },
        deliveryType: 'DELIVERY',
        createdAt: { lt: beforeDate }
      },
      include: { table: true, waitress: true, invoices: true }
    });
    return orders.map(this.mapToOrder);
  }

  async closeStalePendingCashDelivery(id: string, restaurantId: string): Promise<Order | null> {
    try {
      // Mismo update atómico que markPaidIfUnpaid (WHERE isPaid: false): si
      // justo en este momento el cajero confirma el efectivo a mano, solo
      // uno de los dos caminos gana la carrera y se registra un solo ingreso.
      const result = await prisma.order.updateMany({
        where: { id, restaurantId, isPaid: false },
        data: { isPaid: true, driverConfirmedCash: true }
      });
      if (result.count === 0) return null;

      const updated = await prisma.order.findUnique({
        where: { id },
        include: { table: true, waitress: true, invoices: true }
      });
      return updated ? this.mapToOrder(updated) : null;
    } catch (e: any) {
      console.error("Prisma closeStalePendingCashDelivery error:", e);
      return null;
    }
  }

  async assignDriver(id: string, restaurantId: string, driverId: string): Promise<Order | null> {
    try {
      const updated = await prisma.order.update({
        where: { id, restaurantId },
        data: { driverId },
        include: { table: true, waitress: true, invoices: true }
      });
      return this.mapToOrder(updated);
    } catch (e: any) {
      console.error("Prisma assignDriver error:", e);
      return null;
    }
  }

  async updateDriverConfirmedCash(id: string, restaurantId: string, confirmed: boolean): Promise<Order | null> {
    try {
      const updated = await prisma.order.update({
        where: { id, restaurantId },
        data: { driverConfirmedCash: confirmed },
        include: { table: true, waitress: true, invoices: true }
      });
      return this.mapToOrder(updated);
    } catch (e: any) {
      console.error("Prisma updateDriverConfirmedCash error:", e);
      return null;
    }
  }

  async updateTransferConfirmed(id: string, restaurantId: string, confirmed: boolean): Promise<Order | null> {
    try {
      const updated = await prisma.order.update({
        where: { id, restaurantId },
        data: { transferConfirmed: confirmed },
        include: { table: true, waitress: true, invoices: true }
      });
      return this.mapToOrder(updated);
    } catch (e: any) {
      console.error("Prisma updateTransferConfirmed error:", e);
      return null;
    }
  }

  async acceptOrder(id: string, restaurantId: string): Promise<Order | null> {
    try {
      const updated = await prisma.order.update({
        where: { id, restaurantId },
        data: { acceptedAt: new Date() },
        include: { table: true, waitress: true, invoices: true }
      });
      return this.mapToOrder(updated);
    } catch (e: any) {
      console.error("Prisma acceptOrder error:", e);
      return null;
    }
  }

  async findByDriverId(driverId: string, restaurantId?: string): Promise<Order[]> {
    const orders = await prisma.order.findMany({
      where: restaurantId ? { driverId, restaurantId } : { driverId },
      orderBy: { createdAt: 'desc' },
      include: { table: true, waitress: true }
    });
    return orders.map(this.mapToOrder);
  }

  async cancelOldPendingOrders(hoursOld: number): Promise<number> {
    const thresholdDate = new Date(Date.now() - hoursOld * 60 * 60 * 1000);
    
    try {
      const result = await prisma.order.updateMany({
        where: {
          status: 'PENDING',
          createdAt: {
            lt: thresholdDate
          }
        },
        data: {
          status: 'CANCELLED'
        }
      });
      return result.count;
    } catch (e: any) {
      console.error("Prisma cancelOldPendingOrders error:", e);
      return 0;
    }
  }

  async closeStaleUnbilledOrders(beforeDate: Date): Promise<{ completed: number; cancelledForDriver: number }> {
    // Mismos estados "en curso" de siempre (no CANCELLED/DELIVERED, que ya
    // están cerrados) y sin pagar todavía.
    const baseConditions = {
      status: { in: ['PENDING', 'PREPARING', 'READY', 'SENT', 'ARRIVED'] },
      isPaid: false,
      createdAt: { lt: beforeDate }
    };

    // Excluye los pedidos del POS que ya se facturaron al crearse (ver
    // wasBilledInPOS en OrderService): esos ya generaron su ingreso en caja
    // ese mismo día y no hay que tocarlos — solo les falta que alguien
    // marque isPaid más adelante, lo cual sigue siendo válido sin importar
    // cuántos días pasen.
    const notPosBilledOr = [
      { origin: { not: 'POS' } },
      { paymentMethod: 'PENDING' },
      { paymentMethod: 'Pendiente' }
    ];

    try {
      // Domicilios con domiciliario ya asignado: se cancelan, para que el
      // domiciliario deje de verlos como una entrega activa en su propia app.
      const cancelledResult = await prisma.order.updateMany({
        where: {
          AND: [
            baseConditions,
            { OR: notPosBilledOr },
            { deliveryType: 'DELIVERY' },
            { driverId: { not: null } }
          ]
        },
        data: { status: 'CANCELLED' }
      });

      // El resto (mesa, para llevar, o domicilio sin domiciliario asignado
      // todavía): se cierran como completados (DELIVERED) sin facturarse.
      // OrderService.updateOrderStatus bloquea cualquier intento de
      // facturar un pedido de un día anterior, así que quedan cerrados de
      // forma definitiva aunque sigan sin pagar.
      const completedResult = await prisma.order.updateMany({
        where: {
          AND: [
            baseConditions,
            { OR: notPosBilledOr },
            { OR: [{ deliveryType: { not: 'DELIVERY' } }, { driverId: null }] }
          ]
        },
        data: { status: 'DELIVERED' }
      });

      return { completed: completedResult.count, cancelledForDriver: cancelledResult.count };
    } catch (e: any) {
      console.error("Prisma closeStaleUnbilledOrders error:", e);
      return { completed: 0, cancelledForDriver: 0 };
    }
  }

  private mapToOrder(data: any): Order {
    return {
      id: data.id,
      restaurantId: data.restaurantId,
      clientName: data.clientName,
      clientPhone: data.clientPhone,
      clientDocument: data.clientDocument || undefined,
      items: data.items as OrderItem[],
      totalAmount: data.totalAmount,
      status: data.status as OrderStatus,
      paymentMethod: data.paymentMethod as any,
      isPaid: data.isPaid || false,
      deliveryAddress: data.deliveryAddress || '',
      deliveryType: data.deliveryType as any,
      neighborhood: data.neighborhood || undefined,
      city: data.city || undefined,
      orderComments: data.orderComments || undefined,
      origin: data.origin || undefined,
      orderNumber: data.orderNumber || undefined,
      driverId: data.driverId || undefined,
      tableId: data.tableId || undefined,
      tableName: data.table?.name || undefined,
      waitressId: data.waitressId || undefined,
      waitressName: data.waitress ? `${data.waitress.name || ''} ${data.waitress.lastName || ''}`.trim() : undefined,
      driverConfirmedCash: data.driverConfirmedCash || false,
      transferConfirmed: data.transferConfirmed || false,
      acceptedAt: data.acceptedAt || undefined,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      hasInvoice: data.invoices && data.invoices.length > 0
    };
  }
}
