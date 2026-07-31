import { Box, BoxStatus } from '../../domain/models/Box';
import { prisma } from '../db/prisma';

export class PrismaBoxRepository {
  async findAllByRestaurant(restaurantId: string): Promise<Box[]> {
    const boxes = await prisma.box.findMany({ where: { restaurantId } });
    return boxes.map(this.mapToBox);
  }

  async findById(id: string): Promise<Box | undefined> {
    const box = await prisma.box.findUnique({ where: { id } });
    return box ? this.mapToBox(box) : undefined;
  }

  async findByUserId(userId: string): Promise<Box | undefined> {
    const box = await prisma.box.findFirst({ where: { assignedUserId: userId } });
    return box ? this.mapToBox(box) : undefined;
  }

  async create(box: Box): Promise<Box> {
    const newBox = await prisma.box.create({
      data: {
        id: box.id,
        restaurantId: box.restaurantId,
        name: box.name,
        description: box.description,
        assignedUserId: box.assignedUserId,
        status: box.status,
        openedAt: box.openedAt ? new Date(box.openedAt) : null,
        closedAt: box.closedAt ? new Date(box.closedAt) : null,
        currentBalance: box.currentBalance,
        createdAt: new Date(box.createdAt),
        updatedAt: new Date(box.updatedAt),
      }
    });
    return this.mapToBox(newBox);
  }

  async update(id: string, updates: Partial<Box>): Promise<Box | null> {
    const existing = await prisma.box.findUnique({ where: { id } });
    if (!existing) return null;

    const data: any = { ...updates };
    if (updates.openedAt) data.openedAt = new Date(updates.openedAt);
    if (updates.closedAt) data.closedAt = new Date(updates.closedAt);
    if (updates.createdAt) data.createdAt = new Date(updates.createdAt);
    if (updates.updatedAt) data.updatedAt = new Date(updates.updatedAt);

    const updated = await prisma.box.update({
      where: { id },
      data
    });
    return this.mapToBox(updated);
  }

  async delete(id: string): Promise<void> {
    await prisma.box.delete({ where: { id } });
  }

  private mapToBox(data: any): Box {
    return {
      id: data.id,
      restaurantId: data.restaurantId,
      name: data.name,
      description: data.description,
      assignedUserId: data.assignedUserId,
      status: data.status as BoxStatus,
      openedAt: data.openedAt ? data.openedAt.toISOString() : null,
      closedAt: data.closedAt ? data.closedAt.toISOString() : null,
      currentBalance: data.currentBalance,
      createdAt: data.createdAt.toISOString(),
      updatedAt: data.updatedAt.toISOString(),
    };
  }
}
