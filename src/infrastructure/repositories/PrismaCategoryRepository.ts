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

  async delete(id: string, restaurantId: string): Promise<void> {
    await prisma.category.delete({ where: { id, restaurantId } });
  }
  async update(id: string, restaurantId: string, name: string, oldName: string): Promise<Category> {
    // We update the category name, and also we need to update all products that have the old category name.
    // Ambos filtrados por restaurantId: sin eso, renombrar una categoría acá
    // podía cambiar por accidente el nombre de productos de OTRO restaurante
    // que tuviera una categoría con el mismo nombre.
    const [updatedCategory] = await prisma.$transaction([
      prisma.category.update({
        where: { id, restaurantId },
        data: { name }
      }),
      prisma.product.updateMany({
        where: { category: oldName, restaurantId },
        data: { category: name }
      })
    ]);
    return updatedCategory;
  }

  async reorder(restaurantId: string, updates: { id: string, orderIndex: number }[]): Promise<void> {
    await prisma.$transaction(
      updates.map(update =>
        prisma.category.update({
          where: { id: update.id, restaurantId },
          data: { orderIndex: update.orderIndex }
        })
      )
    );
  }
}
