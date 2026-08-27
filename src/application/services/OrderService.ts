import { IOrderRepository } from '../../domain/repositories/IOrderRepository';
import { Order, OrderStatus } from '../../domain/models/Order';
import { FinancialRecordService } from './FinancialRecordService';

import { IProductRepository } from '../../domain/repositories/IProductRepository';
import { ClientService } from './ClientService';

export class OrderService {
  constructor(
    private orderRepository: IOrderRepository,
    private productRepository?: IProductRepository,
    private financialRecordService?: FinancialRecordService,
    private clientService?: ClientService
  ) {}

  async createOrder(orderData: Omit<Order, 'id' | 'createdAt' | 'updatedAt' | 'status'> & { boxId?: string }): Promise<Order> {
    const isPOS = orderData.orderType === 'POS' || orderData.origin === 'POS';
    const isDelivery = orderData.deliveryType === 'DELIVERY';
    const isDineIn = orderData.deliveryType === 'DINE_IN';
    
    // Si es del POS y no es Delivery ni Dine-in (es decir, es Para llevar / Pickup), 
    // asumimos que se entrega y paga ahí mismo.
    const status = (isPOS && !isDelivery && !isDineIn) ? 'DELIVERED' : 'PENDING';

    const lastOrderNumber = await this.orderRepository.findLastOrderNumber(orderData.restaurantId);
    const nextOrderNumber = lastOrderNumber + 1;

    // Omit boxId and clientBirthDate before saving to DB
    const { boxId, clientBirthDate, ...dbData } = orderData as any;

    // Zero-Trust: Recalcular precios desde la base de datos para evitar manipulaciones del cliente
    let calculatedTotal = 0;
    if (this.productRepository) {
      for (const item of orderData.items) {
        const productId = (item as any).productId || item.product?.id;
        if (!productId) continue;

        const product = await this.productRepository.findById(productId);
        if (product && product.restaurantId === orderData.restaurantId) {
          calculatedTotal += product.price * item.quantity;
          item.unitPrice = product.price; // sobrescribir precio del cliente con el oficial
          item.subtotal = item.unitPrice * item.quantity;
          
          if (!item.product) {
            item.product = product as any; // Asegurar que el objeto product exista en el item
          }
        }
      }
    } else {
      // Fallback si no hay repositorio inyectado (aunque siempre debería estarlo)
      calculatedTotal = orderData.totalAmount;
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

    // Solo facturamos automáticamente las órdenes POS que nacen como DELIVERED (ej. Para llevar)
    if (isPOS && order.status === 'DELIVERED' && this.financialRecordService) {
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

  async updateOrderStatus(id: string, restaurantId: string, newStatus: OrderStatus, paymentMethod?: string, boxId?: string): Promise<Order | null> {
    const existingOrder = await this.orderRepository.findById(id);
    if (!existingOrder || existingOrder.restaurantId !== restaurantId) return null;

    const oldStatus = existingOrder.status;
    const updatedOrder = await this.orderRepository.updateStatus(id, restaurantId, newStatus);
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

  async assignDriver(id: string, restaurantId: string, driverId: string): Promise<Order | null> {
    return this.orderRepository.assignDriver(id, restaurantId, driverId);
  }

  async getDriverOrders(driverId: string): Promise<Order[]> {
    return this.orderRepository.findByDriverId(driverId);
  }

  async cancelOldPendingOrders(hoursOld: number = 12): Promise<number> {
    if (this.orderRepository.cancelOldPendingOrders) {
      return this.orderRepository.cancelOldPendingOrders(hoursOld);
    }
    return 0;
  }
}
