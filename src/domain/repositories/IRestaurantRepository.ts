import { Restaurant } from '../models/Restaurant';

export interface IRestaurantRepository {
  findBySlug(slug: string): Promise<Restaurant | null>;
  findById(id: string): Promise<Restaurant | null>;
  update(restaurant: Restaurant): Promise<Restaurant>;
}
