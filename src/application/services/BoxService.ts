import { Box } from '../../domain/models/Box';
import { PrismaBoxRepository } from '../../infrastructure/repositories/PrismaBoxRepository';
import { randomUUID } from 'crypto';
import { prisma } from '../../infrastructure/db/prisma';

export class BoxService {
  constructor(private repository: PrismaBoxRepository) {}

  async getBoxesByRestaurant(restaurantId: string): Promise<Box[]> {
    return this.repository.findAllByRestaurant(restaurantId);
  }

  async getBoxByUserId(userId: string): Promise<Box | undefined> {
    return this.repository.findByUserId(userId);
  }

  async createBox(data: Omit<Box, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'openedAt' | 'closedAt' | 'currentBalance'>): Promise<Box> {
    const newBox: Box = {
      ...data,
      id: randomUUID(),
      status: 'CLOSED',
      openedAt: null,
      closedAt: null,
      currentBalance: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    return this.repository.create(newBox);
  }

  async updateBox(id: string, updates: Partial<Box>): Promise<Box | null> {
    return this.repository.update(id, updates);
  }

  async openBox(id: string, initialAmount: number): Promise<Box | null> {
    return this.repository.update(id, {
      status: 'OPEN',
      openedAt: new Date().toISOString(),
      closedAt: null,
      currentBalance: initialAmount
    });
  }

  async closeBox(id: string, data: any): Promise<Box | null> {
    const box = await this.repository.findById(id);
    if (!box) return null;

    const closedAt = new Date();

    // Create session record
    await prisma.boxSession.create({
      data: {
        id: randomUUID(),
        boxId: id,
        restaurantId: box.restaurantId,
        userId: data.userId || box.assignedUserId,
        openedAt: box.openedAt ? new Date(box.openedAt) : new Date(),
        closedAt: closedAt,
        initialBalance: box.currentBalance,
        systemBalance: data.systemTotal || 0,
        manualCount: data.manualCount || 0,
        difference: data.difference || 0,
        comments: data.comments || null
      }
    });

    return this.repository.update(id, {
      status: 'CLOSED',
      closedAt: closedAt.toISOString()
    });
  }

  async deleteBox(id: string): Promise<void> {
    const box = await this.repository.findById(id);
    if (!box) throw new Error('Box not found');
    
    // Check if box has sessions
    const sessionCount = await prisma.boxSession.count({ where: { boxId: id } });
    if (sessionCount > 0) {
      throw new Error('No se puede eliminar la caja porque tiene un historial de sesiones asociado.');
    }

    await this.repository.delete(id);
  }
}
