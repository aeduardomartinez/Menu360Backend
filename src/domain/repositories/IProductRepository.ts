import { Product } from '../models/Product';

export interface IProductRepository {
  findAll(): Promise<Product[]>;
  findByRestaurant(restaurantId: string): Promise<Product[]>;
  findById(id: string): Promise<Product | null>;
  create(product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Promise<Product>;
  update(id: string, restaurantId: string, productData: Partial<Product>): Promise<Product | null>;
  delete(id: string, restaurantId: string): Promise<boolean>;
  updateAvailability(id: string, restaurantId: string, isAvailable: boolean): Promise<Product | null>;
}
