import { Order, OrderStatus, OrderItem } from '../../domain/models/Order';
import { IOrderRepository } from '../../domain/repositories/IOrderRepository';
import { prisma } from '../db/prisma';

export class PrismaOrderRepository implements IOrderRepository {
  async findAll(restaurantId?: string): Promise<Order[]> {
    const orders = await prisma.order.findMany({
      where: restaurantId ? { restaurantId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { table: true, waitress: true }
    });
    return orders.map(this.mapToOrder);
  }

  async findById(id: string): Promise<Order | null> {
    const order = await prisma.order.findUnique({ 
      where: { id },
      include: { table: true, waitress: true }
    });
    return order ? this.mapToOrder(order) : null;
  }

  async findByOrderNumber(orderNumber: number, restaurantId: string): Promise<Order | null> {
    const order = await prisma.order.findFirst({
      where: { orderNumber, restaurantId },
      include: { table: true, waitress: true }
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
        items: orderData.items as any,
        totalAmount: orderData.totalAmount,
        status: orderData.status,
        paymentMethod: orderData.paymentMethod,
        deliveryAddress: orderData.deliveryAddress,
        deliveryType: orderData.deliveryType,
        neighborhood: orderData.neighborhood,
        city: orderData.city,
        orderComments: orderData.orderComments,
        orderType: orderData.orderType,
        origin: orderData.origin,
        orderNumber: orderData.orderNumber,
        tableId: orderData.tableId,
        waitressId: orderData.waitressId,
      },
      include: { table: true, waitress: true }
    });
    return this.mapToOrder(newOrder);
  }

  async updateStatus(id: string, restaurantId: string, status: OrderStatus): Promise<Order | null> {
    try {
      const updated = await prisma.order.update({
        where: { id, restaurantId },
        data: { status },
        include: { table: true, waitress: true }
      });
      return this.mapToOrder(updated);
    } catch (e: any) {
      console.error("Prisma updateStatus error:", e);
      return null;
    }
  }

  async assignDriver(id: string, restaurantId: string, driverId: string): Promise<Order | null> {
    try {
      const updated = await prisma.order.update({
        where: { id, restaurantId },
        data: { driverId },
        include: { table: true, waitress: true }
      });
      return this.mapToOrder(updated);
    } catch (e: any) {
      console.error("Prisma assignDriver error:", e);
      return null;
    }
  }

  async findByDriverId(driverId: string): Promise<Order[]> {
    const orders = await prisma.order.findMany({
      where: { driverId },
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

  private mapToOrder(data: any): Order {
    return {
      id: data.id,
      restaurantId: data.restaurantId,
      clientName: data.clientName,
      clientPhone: data.clientPhone,
      items: data.items as OrderItem[],
      totalAmount: data.totalAmount,
      status: data.status as OrderStatus,
      paymentMethod: data.paymentMethod as any,
      deliveryAddress: data.deliveryAddress || '',
      deliveryType: data.deliveryType as any,
      neighborhood: data.neighborhood || undefined,
      city: data.city || undefined,
      orderComments: data.orderComments || undefined,
      orderType: data.orderType as any,
      origin: data.origin as any,
      orderNumber: data.orderNumber || undefined,
      driverId: data.driverId || undefined,
      tableId: data.tableId || undefined,
      tableName: data.table?.name || undefined,
      waitressId: data.waitressId || undefined,
      waitressName: data.waitress ? `${data.waitress.name || ''} ${data.waitress.lastName || ''}`.trim() : undefined,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    };
  }
}
