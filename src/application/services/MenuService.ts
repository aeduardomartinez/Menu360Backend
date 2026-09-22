import { IProductRepository } from '../../domain/repositories/IProductRepository';
import { IImageStorage } from '../../domain/services/IImageStorage';
import { Product } from '../../domain/models/Product';

export class MenuService {
  constructor(
    private productRepository: IProductRepository,
    // Opcional para no romper a quien construya el servicio sin él (y para
    // poder probarlo sin credenciales de Firebase): si falta, simplemente no
    // se limpian las imágenes viejas.
    private imageStorage?: IImageStorage
  ) {}

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

  /**
   * Actualiza el plato y, si le cambiaron la foto, borra la anterior de
   * Storage.
   *
   * Cada subida crea una ruta nueva con UUID, así que sin esto cambiarle la
   * foto a un plato cinco veces deja cuatro imágenes que ya nadie usa
   * ocupando espacio que se paga todos los meses.
   *
   * El borrado va DESPUÉS de que el guardado haya salido bien, y nunca antes:
   * si se borrara primero y el guardado fallara, el plato se quedaría
   * apuntando a una imagen que ya no existe.
   */
  async updateProduct(id: string, restaurantId: string, productData: Partial<Product>): Promise<Product | null> {
    const anterior = productData.imageUrl !== undefined
      ? await this.productRepository.findById(id)
      : null;

    const actualizado = await this.productRepository.update(id, restaurantId, productData);
    if (!actualizado) return null;

    if (anterior && anterior.imageUrl && anterior.imageUrl !== actualizado.imageUrl) {
      // findById no filtra por restaurante, así que se comprueba acá antes de
      // borrar nada: sin esto, un id de otro restaurante llevaría a borrar su
      // imagen aunque el update no hubiera tocado su plato.
      if (anterior.restaurantId === restaurantId) {
        await this.imageStorage?.deleteByUrl(anterior.imageUrl);
      }
    }

    return actualizado;
  }

  /** Borra el plato y, con él, su imagen en Storage. */
  async deleteProduct(id: string, restaurantId: string): Promise<boolean> {
    const producto = await this.productRepository.findById(id);
    const borrado = await this.productRepository.delete(id, restaurantId);

    if (borrado && producto?.imageUrl && producto.restaurantId === restaurantId) {
      await this.imageStorage?.deleteByUrl(producto.imageUrl);
    }

    return borrado;
  }
}
