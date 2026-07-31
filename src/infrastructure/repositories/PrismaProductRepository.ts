import { Product, ProductVariant } from '../../domain/models/Product';
import { IProductRepository } from '../../domain/repositories/IProductRepository';
import { prisma } from '../db/prisma';

export class PrismaProductRepository implements IProductRepository {
  async findAll(): Promise<Product[]> {
    const products = await prisma.product.findMany();
    return products.map(this.mapToProduct);
  }

  async findByRestaurant(restaurantId: string): Promise<Product[]> {
    const products = await prisma.product.findMany({ where: { restaurantId } });
    return products.map(this.mapToProduct);
  }

  async findById(id: string): Promise<Product | null> {
    const product = await prisma.product.findUnique({ where: { id } });
    return product ? this.mapToProduct(product) : null;
  }

  async create(productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Promise<Product> {
    const newProduct = await prisma.product.create({
      data: {
        restaurantId: productData.restaurantId,
        name: productData.name,
        description: productData.description,
        price: productData.price,
        category: productData.category,
        imageUrl: productData.imageUrl,
        isAvailable: productData.isAvailable,
        trackStock: productData.trackStock ?? false,
        currentStock: productData.currentStock,

        isFeatured: productData.isFeatured,
        variants: productData.variants ? (productData.variants as any) : undefined,
        modifierIds: productData.modifierIds || [],
      }
    });
    return this.mapToProduct(newProduct);
  }

  async update(id: string, productData: Partial<Product>): Promise<Product | null> {
    const data: any = { ...productData };
    if (data.variants !== undefined) data.variants = data.variants as any;
    
    // Remove un-updatable fields
    delete data.id;
    delete data.createdAt;
    delete data.updatedAt;

    try {
      const updated = await prisma.product.update({
        where: { id },
        data
      });
      return this.mapToProduct(updated);
    } catch {
      return null;
    }
  }

  async updateAvailability(id: string, isAvailable: boolean): Promise<Product | null> {
    try {
      const updated = await prisma.product.update({
        where: { id },
        data: { isAvailable }
      });
      return this.mapToProduct(updated);
    } catch {
      return null;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await prisma.product.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  private mapToProduct(data: any): Product {
    return {
      id: data.id,
      restaurantId: data.restaurantId,
      name: data.name,
      description: data.description || '',
      price: data.price,
      category: data.category,
      imageUrl: data.imageUrl,
      isAvailable: data.isAvailable,
      trackStock: data.trackStock,
      currentStock: data.currentStock,

      isFeatured: data.isFeatured ?? undefined,
      variants: data.variants ? (data.variants as ProductVariant[]) : undefined,
      modifierIds: data.modifierIds,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }
}
