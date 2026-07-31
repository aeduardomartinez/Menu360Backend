import { Box, BoxStatus } from '../../domain/models/Box';

export class InMemoryBoxRepository {
  private boxes: Box[] = [
    {
      id: 'box-1',
      restaurantId: 'rest-1',
      name: 'Caja Principal',
      description: 'Creada automáticamente',
      assignedUserId: 'admin-1',
      status: 'CLOSED',
      openedAt: null,
      closedAt: null,
      currentBalance: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  async findAllByRestaurant(restaurantId: string): Promise<Box[]> {
    return this.boxes.filter(b => b.restaurantId === restaurantId);
  }

  async findById(id: string): Promise<Box | undefined> {
    return this.boxes.find(b => b.id === id);
  }

  async findByUserId(userId: string): Promise<Box | undefined> {
    return this.boxes.find(b => b.assignedUserId === userId);
  }

  async create(box: Box): Promise<Box> {
    this.boxes.push(box);
    return box;
  }

  async update(id: string, updates: Partial<Box>): Promise<Box | null> {
    const index = this.boxes.findIndex(b => b.id === id);
    if (index === -1) return null;
    this.boxes[index] = { ...this.boxes[index], ...updates, updatedAt: new Date().toISOString() };
    return this.boxes[index];
  }
}
