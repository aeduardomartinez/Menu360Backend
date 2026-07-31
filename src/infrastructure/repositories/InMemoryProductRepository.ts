import { Product } from '../../domain/models/Product';
import { IProductRepository } from '../../domain/repositories/IProductRepository';

export class InMemoryProductRepository implements IProductRepository {
  private products: Product[] = [
    {
      id: '1',
      restaurantId: 'rest-1',
      name: 'Hamburguesa Sencilla',
      description: 'Carne de res 150g, queso cheddar, lechuga, tomate y salsa de la casa.',
      price: 15000,
      imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=60',
      category: 'Fuertes',
      isAvailable: true,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: '2',
      restaurantId: 'rest-1',
      name: 'Perro Caliente Especial',
      description: 'Salchicha americana, tocineta, queso fundido, ripio de papa y salsas.',
      price: 12000,
      imageUrl: 'https://images.unsplash.com/photo-1619740455993-9e612b1af08a?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=60',
      category: 'Fuertes',
      isAvailable: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  async findAll(): Promise<Product[]> {
    return this.products;
  }

  async findByRestaurant(restaurantId: string): Promise<Product[]> {
    return this.products.filter(p => p.restaurantId === restaurantId);
  }

  async findById(id: string): Promise<Product | null> {
    return this.products.find(p => p.id === id) || null;
  }

  async create(productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Promise<Product> {
    const newProduct: Product = { 
      ...productData, 
      id: Date.now().toString(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.products.push(newProduct);
    return newProduct;
  }

  async update(id: string, productData: Partial<Product>): Promise<Product | null> {
    const index = this.products.findIndex(p => p.id === id);
    if (index !== -1) {
      this.products[index] = { ...this.products[index], ...productData };
      return this.products[index];
    }
    return null;
  }

  async updateAvailability(id: string, isAvailable: boolean): Promise<Product | null> {
    const index = this.products.findIndex(p => p.id === id);
    if (index !== -1) {
      this.products[index].isAvailable = isAvailable;
      return this.products[index];
    }
    return null;
  }

  async delete(id: string): Promise<boolean> {
    const initialLength = this.products.length;
    this.products = this.products.filter(p => p.id !== id);
    return this.products.length < initialLength;
  }
}
