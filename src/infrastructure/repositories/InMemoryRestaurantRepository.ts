import { Restaurant } from '../../domain/models/Restaurant';
import { IRestaurantRepository } from '../../domain/repositories/IRestaurantRepository';
import fs from 'fs';
import path from 'path';

export class InMemoryRestaurantRepository implements IRestaurantRepository {
  private restaurants: Restaurant[] = [];
  private dataFile: string;

  constructor() {
    this.dataFile = path.join(__dirname, 'restaurants.json');
    this.loadData();
  }

  private loadData() {
    try {
      if (fs.existsSync(this.dataFile)) {
        const rawData = fs.readFileSync(this.dataFile, 'utf-8');
        this.restaurants = JSON.parse(rawData);
      } else {
        this.restaurants = [
          {
            id: 'rest-1',
            slug: 'demo',
            name: 'Restaurante Demo',
            logoBase64: null,
            themeColor: '#f43f5e'
          }
        ];
        this.saveData();
      }
    } catch (error) {
      console.error('Error loading restaurant data from file', error);
      this.restaurants = [
        {
          id: 'rest-1',
          slug: 'demo',
          name: 'Restaurante Demo',
          logoBase64: null,
          themeColor: '#f43f5e'
        }
      ];
    }
  }

  private saveData() {
    try {
      fs.writeFileSync(this.dataFile, JSON.stringify(this.restaurants, null, 2));
    } catch (error) {
      console.error('Error saving restaurant data to file', error);
    }
  }

  async findBySlug(slug: string): Promise<Restaurant | null> {
    return this.restaurants.find(r => r.slug === slug) || null;
  }

  async findById(id: string): Promise<Restaurant | null> {
    return this.restaurants.find(r => r.id === id) || null;
  }

  async update(restaurant: Restaurant): Promise<Restaurant> {
    const index = this.restaurants.findIndex(r => r.id === restaurant.id);
    if (index !== -1) {
      this.restaurants[index] = restaurant;
      this.saveData();
      return restaurant;
    }
    throw new Error('Restaurant not found');
  }
}
