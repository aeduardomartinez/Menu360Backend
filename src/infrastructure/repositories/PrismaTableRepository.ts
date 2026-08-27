import { Table } from '../../domain/models/Table';
import { prisma } from '../db/prisma';

export class PrismaTableRepository {
  async create(table: Table): Promise<Table> {
    const newTable = await prisma.table.create({
      data: {
        id: table.id,
        restaurantId: table.restaurantId,
        name: table.name,
        capacity: table.capacity,
        isActive: table.isActive,
      }
    });
    return { ...newTable, capacity: newTable.capacity ?? undefined };
  }

  async findByRestaurant(restaurantId: string): Promise<Table[]> {
    const tables = await prisma.table.findMany({
      where: { restaurantId },
      orderBy: { name: 'asc' }
    });
    return tables.map(t => ({ ...t, capacity: t.capacity ?? undefined }));
  }

  async delete(id: string): Promise<void> {
    await prisma.table.delete({ where: { id } });
  }

  async update(id: string, name: string, capacity?: number, isActive?: boolean): Promise<Table> {
    const updatedTable = await prisma.table.update({
      where: { id },
      data: { name, capacity, isActive }
    });
    return { ...updatedTable, capacity: updatedTable.capacity ?? undefined };
  }
}
