import { Category } from '../../domain/models/Category';
import { PrismaCategoryRepository } from '../../infrastructure/repositories/PrismaCategoryRepository';
import { randomUUID } from 'crypto';

export class CategoryService {
  constructor(private repository: PrismaCategoryRepository) {}

  async createCategory(categoryData: Omit<Category, 'id'>): Promise<Category> {
    const newCategory: Category = {
      ...categoryData,
      id: randomUUID()
    };
    return this.repository.create(newCategory);
  }

  async updateCategory(id: string, restaurantId: string, name: string, oldName: string): Promise<Category> {
    return this.repository.update(id, restaurantId, name, oldName);
  }

  async getCategoriesByRestaurant(restaurantId: string): Promise<Category[]> {
    return this.repository.findByRestaurant(restaurantId);
  }

  async deleteCategory(id: string, restaurantId: string): Promise<void> {
    return this.repository.delete(id, restaurantId);
  }

  async reorderCategories(restaurantId: string, updates: { id: string, orderIndex: number }[]): Promise<void> {
    return this.repository.reorder(restaurantId, updates);
  }
}
