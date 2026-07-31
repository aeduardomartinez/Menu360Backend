import { ModifierCategory } from '../../domain/models/ModifierCategory';

export class InMemoryModifierRepository {
  private modifiers: ModifierCategory[] = [];

  async create(modifier: Omit<ModifierCategory, 'id' | 'createdAt' | 'updatedAt'>): Promise<ModifierCategory> {
    const newModifier: ModifierCategory = {
      ...modifier,
      id: Date.now().toString(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.modifiers.push(newModifier);
    return newModifier;
  }

  async findByRestaurant(restaurantId: string): Promise<ModifierCategory[]> {
    return this.modifiers.filter(m => m.restaurantId === restaurantId);
  }

  async findByProduct(productId: string): Promise<ModifierCategory[]> {
    return this.modifiers.filter(m => m.associatedProductIds.includes(productId));
  }

  async update(id: string, updates: Partial<ModifierCategory>): Promise<ModifierCategory | null> {
    const index = this.modifiers.findIndex(m => m.id === id);
    if (index === -1) return null;
    
    this.modifiers[index] = { ...this.modifiers[index], ...updates, updatedAt: new Date() };
    return this.modifiers[index];
  }

  async delete(id: string): Promise<boolean> {
    const index = this.modifiers.findIndex(m => m.id === id);
    if (index === -1) return false;
    
    this.modifiers.splice(index, 1);
    return true;
  }
}

export const modifierRepository = new InMemoryModifierRepository();
