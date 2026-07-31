import { IOrderRepository } from '../../domain/repositories/IOrderRepository';
import { Order, OrderStatus } from '../../domain/models/Order';
import fs from 'fs';
import path from 'path';

const DB_FILE = path.join(__dirname, 'orders.json');

export class InMemoryOrderRepository implements IOrderRepository {
  private orders: Order[] = [];

  constructor() {
    this.loadOrders();
  }

  private loadOrders() {
    if (fs.existsSync(DB_FILE)) {
      try {
        const data = fs.readFileSync(DB_FILE, 'utf-8');
        this.orders = JSON.parse(data).map((o: any) => ({
          ...o,
          createdAt: new Date(o.createdAt),
          updatedAt: new Date(o.updatedAt)
        }));
      } catch (e) {
        console.error('Error parsing orders DB', e);
        this.orders = [];
      }
    }
  }

  private saveOrders() {
    fs.writeFileSync(DB_FILE, JSON.stringify(this.orders, null, 2));
  }

  async findAll(): Promise<Order[]> {
    return this.orders.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findById(id: string): Promise<Order | null> {
    return this.orders.find(o => o.id === id) || null;
  }

  async findByOrderNumber(orderNumber: number, restaurantId: string): Promise<Order | null> {
    return this.orders.find(o => o.orderNumber === orderNumber && o.restaurantId === restaurantId) || null;
  }

  async create(orderData: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>): Promise<Order> {
    const newOrder: Order = {
      ...orderData,
      id: Date.now().toString(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.orders.push(newOrder);
    this.saveOrders();
    return newOrder;
  }

  async updateStatus(id: string, status: OrderStatus): Promise<Order | null> {
    const index = this.orders.findIndex(o => o.id === id);
    if (index === -1) return null;
    this.orders[index] = { ...this.orders[index], status, updatedAt: new Date() };
    this.saveOrders();
    return this.orders[index];
  }
}
