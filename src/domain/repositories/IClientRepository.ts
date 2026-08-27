import { Client } from '../models/Client';

export interface IClientRepository {
  create(client: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>): Promise<Client>;
  findById(id: string): Promise<Client | null>;
  findByRestaurant(restaurantId: string): Promise<Client[]>;
  searchByPhoneOrName(restaurantId: string, query: string): Promise<Client[]>;
  findByExactPhone(restaurantId: string, phone: string): Promise<Client | null>;
  update(id: string, updates: Partial<Client>): Promise<Client | null>;
}
