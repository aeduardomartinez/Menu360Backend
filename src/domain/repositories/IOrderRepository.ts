import { Order, OrderStatus } from '../models/Order';

export interface IOrderRepository {
  findAll(restaurantId?: string): Promise<Order[]>;
  findById(id: string): Promise<Order | null>;
  findByOrderNumber(orderNumber: number, restaurantId: string): Promise<Order | null>;
  create(order: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>): Promise<Order>;
  updateStatus(id: string, status: OrderStatus): Promise<Order | null>;
  assignDriver(id: string, driverId: string): Promise<Order | null>;
  findByDriverId(driverId: string): Promise<Order[]>;
  findLastOrderNumber(restaurantId: string): Promise<number>;
}
