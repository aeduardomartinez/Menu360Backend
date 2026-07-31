import { Category } from '../../domain/models/Category';

export class InMemoryCategoryRepository {
  private categories: Category[] = [
    { id: 'cat-1', restaurantId: 'rest-1', name: 'Entradas', orderIndex: 0 },
    { id: 'cat-2', restaurantId: 'rest-1', name: 'Platos Fuertes', orderIndex: 1 },
    { id: 'cat-3', restaurantId: 'rest-1', name: 'Bebidas', orderIndex: 2 }
  ];

  async create(category: Category): Promise<Category> {
    this.categories.push(category);
    return category;
  }

  async findByRestaurant(restaurantId: string): Promise<Category[]> {
    return this.categories
      .filter(c => c.restaurantId === restaurantId)
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }

  async delete(id: string): Promise<void> {
    this.categories = this.categories.filter(c => c.id !== id);
  }
}
