import { IOrderRepository } from '../../domain/repositories/IOrderRepository';
import { Order, OrderStatus } from '../../domain/models/Order';
import { FinancialRecordService } from './FinancialRecordService';

export class OrderService {
  constructor(
    private orderRepository: IOrderRepository,
    private financialRecordService?: FinancialRecordService
  ) {}

  async createOrder(orderData: Omit<Order, 'id' | 'createdAt' | 'updatedAt' | 'status'> & { boxId?: string }): Promise<Order> {
    const isPOS = orderData.orderType === 'POS';
    const isDelivery = orderData.deliveryType === 'DELIVERY';
    const status = (isPOS && !isDelivery) ? 'DELIVERED' : 'PENDING';

    const lastOrderNumber = await this.orderRepository.findLastOrderNumber(orderData.restaurantId);
    const nextOrderNumber = lastOrderNumber + 1;

    // Omit boxId before saving to DB
    const { boxId, ...dbData } = orderData as any;

    const order = await this.orderRepository.create({
      ...dbData,
      status,
      orderNumber: nextOrderNumber,
    });

    if (order.orderType === 'POS' && this.financialRecordService) {
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

  async getAllOrders(restaurantId?: string): Promise<Order[]> {
    return this.orderRepository.findAll(restaurantId);
  }

  async updateOrderStatus(id: string, newStatus: OrderStatus, paymentMethod?: string, boxId?: string): Promise<Order | null> {
    const existingOrder = await this.orderRepository.findById(id);
    if (!existingOrder) return null;

    const oldStatus = existingOrder.status;
    const updatedOrder = await this.orderRepository.updateStatus(id, newStatus);
    if (!updatedOrder) return null;

    // Facturación de Pedido (Web o App) que pasa a DELIVERED
    if (newStatus === 'DELIVERED' && oldStatus !== 'DELIVERED' && updatedOrder.orderType !== 'POS' && this.financialRecordService) {
      await this.financialRecordService.createRecord({
        restaurantId: updatedOrder.restaurantId,
        type: 'INCOME',
        amount: updatedOrder.totalAmount,
        category: 'Venta Web',
        paymentMethod: paymentMethod || 'Efectivo',
        boxName: 'Caja principal',
        boxId: boxId,
        date: new Date().toISOString(),
        description: `Cobro de pedido #${String(updatedOrder.orderNumber).padStart(4, '0')}`
      });
    }

    // Reverso de Facturación (Si se cancela un pedido que ya estaba entregado/pagado)
    if (newStatus === 'CANCELLED' && oldStatus === 'DELIVERED' && this.financialRecordService) {
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

  async revertOrder(id: string, boxId?: string): Promise<Order | null> {
    const existingOrder = await this.orderRepository.findById(id);
    if (!existingOrder || existingOrder.status !== 'DELIVERED') return null;

    // Change status back to PENDING
    const updatedOrder = await this.orderRepository.updateStatus(id, 'PENDING');
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

  async assignDriver(id: string, driverId: string): Promise<Order | null> {
    return this.orderRepository.assignDriver(id, driverId);
  }

  async getDriverOrders(driverId: string): Promise<Order[]> {
    return this.orderRepository.findByDriverId(driverId);
  }
}
