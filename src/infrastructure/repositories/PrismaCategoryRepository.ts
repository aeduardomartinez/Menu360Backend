import { Category } from '../../domain/models/Category';
import { prisma } from '../db/prisma';

export class PrismaCategoryRepository {
  async create(category: Category): Promise<Category> {
    const newCategory = await prisma.category.create({
      data: {
        id: category.id,
        restaurantId: category.restaurantId,
        name: category.name,
        orderIndex: category.orderIndex,
      }
    });
    return newCategory;
  }

  async findByRestaurant(restaurantId: string): Promise<Category[]> {
    return prisma.category.findMany({
      where: { restaurantId },
      orderBy: { orderIndex: 'asc' }
    });
  }

  async delete(id: string): Promise<void> {
    await prisma.category.delete({ where: { id } });
  }
  async update(id: string, name: string, oldName: string): Promise<Category> {
    // We update the category name, and also we need to update all products that have the old category name
    const [updatedCategory] = await prisma.$transaction([
      prisma.category.update({
        where: { id },
        data: { name }
      }),
      prisma.product.updateMany({
        where: { category: oldName },
        data: { category: name }
      })
    ]);
    return updatedCategory;
  }
}
