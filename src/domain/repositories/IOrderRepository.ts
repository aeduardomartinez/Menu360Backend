import { Order, OrderStatus } from '../models/Order';

export interface OrderQueryOptions {
  // Rango de fechas (YYYY-MM-DD) para acotar la consulta. Los pedidos de
  // domicilio en efectivo entregados y aún no confirmados por el cajero
  // siempre se incluyen sin importar la fecha (ver PrismaOrderRepository).
  startDate?: string;
  endDate?: string;
  // Búsqueda por texto (id, cliente, teléfono, número de pedido). Cuando se
  // provee, el rango de fechas se ignora y se busca en todo el historial
  // del restaurante.
  search?: string;
}

export interface IOrderRepository {
  findAll(restaurantId?: string, options?: OrderQueryOptions): Promise<Order[]>;
  findById(id: string): Promise<Order | null>;
  findByOrderNumber(orderNumber: number, restaurantId: string): Promise<Order | null>;
  create(order: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>): Promise<Order>;
  // orderComments es opcional y solo se usa para reescribir la nota del
  // pedido al facturarlo (ver OrderService.updateOrderStatus y la etiqueta
  // "[Paga con: ...]"). Sin él, los comentarios quedan como estaban.
  updateStatus(id: string, restaurantId: string, status: OrderStatus, paymentMethod?: string, orderComments?: string): Promise<Order | null>;
  updatePaymentStatus(id: string, restaurantId: string, isPaid: boolean): Promise<Order | null>;
  // Update condicional atómico: solo marca el pedido como pagado si en ESE
  // instante, en la base de datos, todavía sigue sin pagar (WHERE
  // isPaid: false). Devuelve el pedido actualizado si esta llamada fue la
  // que hizo el cambio, o null si ya estaba pagado (no hizo nada). Existe
  // para blindar el registro de ingresos contra dos facturaciones casi
  // simultáneas del mismo pedido — doble click del cajero, o un reintento
  // de red — que de otra forma podrían leer isPaid=false las dos y generar
  // dos ingresos duplicados para la misma venta.
  markPaidIfUnpaid(id: string, restaurantId: string): Promise<Order | null>;
  // Domicilios en efectivo ya entregados (status DELIVERED) de un día
  // anterior donde nadie confirmó el efectivo (ni el cajero ni el
  // domiciliario desde "Mis entregas"). closeStaleUnbilledOrders no los toca
  // porque ya están DELIVERED; estos dos métodos existen para que el barrido
  // diario los cierre por separado, asumiendo que el efectivo sí se cobró
  // (el pedido sí se entregó), en vez de dejarlos esperando para siempre.
  findStaleUnconfirmedCashDeliveries(beforeDate: Date): Promise<Order[]>;
  // Igual que markPaidIfUnpaid (WHERE isPaid: false atómico), pero además
  // marca driverConfirmedCash para que el pedido deje de mostrarse como
  // "Esperando efectivo".
  closeStalePendingCashDelivery(id: string, restaurantId: string): Promise<Order | null>;
  assignDriver(id: string, restaurantId: string, driverId: string): Promise<Order | null>;
  findByDriverId(driverId: string, restaurantId?: string): Promise<Order[]>;
  updateDriverConfirmedCash(id: string, restaurantId: string, confirmed: boolean): Promise<Order | null>;
  // Marca que el cajero verificó que la transferencia llegó a la cuenta del
  // restaurante. No factura ni registra ningún ingreso: eso ocurre después,
  // cuando el pedido se factura (ver updateOrderStatus en OrderService).
  updateTransferConfirmed(id: string, restaurantId: string, confirmed: boolean): Promise<Order | null>;
  // Marca un pedido de la web como aceptado por el restaurante. No toca el
  // estado del pedido: sigue "Pendiente" hasta que alguien lo pase a
  // preparación manualmente (ver acceptedAt en schema.prisma).
  acceptOrder(id: string, restaurantId: string): Promise<Order | null>;
  cancelOldPendingOrders(hoursOld: number): Promise<number>;
  // Cierra automáticamente los pedidos de días anteriores que se quedaron
  // sin facturar (ni el cajero los cerró ni se registró ningún cobro): los
  // domicilios con domiciliario ya asignado se cancelan (para que el
  // domiciliario deje de verlos como una entrega activa); el resto se marca
  // como completado (DELIVERED) sin generar ningún ingreso. `beforeDate` es
  // el inicio del día de hoy — solo se tocan pedidos creados antes de esa
  // fecha.
  closeStaleUnbilledOrders(beforeDate: Date): Promise<{ completed: number; cancelledForDriver: number }>;
  findLastOrderNumber(restaurantId: string): Promise<number>;
}
