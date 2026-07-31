import { ModifierCategory } from '../../domain/models/ModifierCategory';
import { prisma } from '../db/prisma';

export class PrismaModifierRepository {
  async create(modifier: Omit<ModifierCategory, 'id' | 'createdAt' | 'updatedAt'>): Promise<ModifierCategory> {
    const newModifier = await prisma.modifierCategory.create({
      data: {
        restaurantId: modifier.restaurantId,
        name: modifier.name,
        selection: modifier.selectionType,
        isRequired: modifier.isRequired,
        options: {
          options: modifier.options,
          associatedProductIds: modifier.associatedProductIds
        } as any,
      }
    });
    return this.mapToModifierCategory(newModifier);
  }

  async findByRestaurant(restaurantId: string): Promise<ModifierCategory[]> {
    const modifiers = await prisma.modifierCategory.findMany({ where: { restaurantId } });
    return modifiers.map(this.mapToModifierCategory);
  }

  async findByProduct(productId: string): Promise<ModifierCategory[]> {
    const modifiers = await prisma.modifierCategory.findMany();
    const mapped = modifiers.map(this.mapToModifierCategory);
    return mapped.filter(m => m.associatedProductIds.includes(productId));
  }

  async update(id: string, updates: Partial<ModifierCategory>): Promise<ModifierCategory | null> {
    const existing = await prisma.modifierCategory.findUnique({ where: { id } });
    if (!existing) return null;
    
    const current = this.mapToModifierCategory(existing);
    const updatedPayload = { ...current, ...updates };

    const updated = await prisma.modifierCategory.update({
      where: { id },
      data: {
        name: updatedPayload.name,
        selection: updatedPayload.selectionType,
        isRequired: updatedPayload.isRequired,
        options: {
          options: updatedPayload.options,
          associatedProductIds: updatedPayload.associatedProductIds
        } as any
      }
    });

    return this.mapToModifierCategory(updated);
  }

  async delete(id: string): Promise<boolean> {
    try {
      await prisma.modifierCategory.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  private mapToModifierCategory(data: any): ModifierCategory {
    const opts = (data.options as any) || {};
    return {
      id: data.id,
      restaurantId: data.restaurantId,
      name: data.name,
      selectionType: data.selection as any,
      isRequired: data.isRequired,
      options: opts.options || [],
      associatedProductIds: opts.associatedProductIds || [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }
}

export const modifierRepository = new PrismaModifierRepository();
