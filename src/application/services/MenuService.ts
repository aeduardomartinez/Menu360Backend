import { IProductRepository } from '../../domain/repositories/IProductRepository';
import { Product } from '../../domain/models/Product';

export class MenuService {
  constructor(private productRepository: IProductRepository) {}

  async getAllProducts(restaurantId: string): Promise<Product[]> {
    return this.productRepository.findByRestaurant(restaurantId);
  }

  async getAvailableProducts(restaurantId: string): Promise<Product[]> {
    const products = await this.productRepository.findByRestaurant(restaurantId);
    return products.filter(p => p.isAvailable);
  }

  async addProduct(productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Promise<Product> {
    return this.productRepository.create(productData);
  }

  async toggleProductAvailability(id: string, restaurantId: string, isAvailable: boolean): Promise<Product | null> {
    return this.productRepository.updateAvailability(id, restaurantId, isAvailable);
  }

  async updateProduct(id: string, restaurantId: string, productData: Partial<Product>): Promise<Product | null> {
    return this.productRepository.update(id, restaurantId, productData);
  }

  async deleteProduct(id: string, restaurantId: string): Promise<boolean> {
    return this.productRepository.delete(id, restaurantId);
  }
}
