import { IRestaurantRepository } from '../../domain/repositories/IRestaurantRepository';
import { Restaurant } from '../../domain/models/Restaurant';

export class RestaurantService {
  constructor(private restaurantRepository: IRestaurantRepository) {}

  async getRestaurantBySlug(slug: string): Promise<Restaurant | null> {
    return this.restaurantRepository.findBySlug(slug);
  }

  async getRestaurantById(id: string): Promise<Restaurant | null> {
    return this.restaurantRepository.findById(id);
  }

  async updateRestaurant(id: string, data: Partial<Restaurant>): Promise<Restaurant> {
    const restaurant = await this.restaurantRepository.findById(id);
    if (!restaurant) throw new Error('Restaurant not found');
    
    const updated = { ...restaurant, ...data };
    return this.restaurantRepository.update(updated);
  }
}
