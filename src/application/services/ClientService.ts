import { Client } from '../../domain/models/Client';
import { IClientRepository } from '../../domain/repositories/IClientRepository';

export class ClientService {
  constructor(private repository: IClientRepository) { }

  async createClient(data: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>): Promise<Client> {
    return this.repository.create(data);
  }

  async getClientById(id: string): Promise<Client | null> {
    return this.repository.findById(id);
  }

  async getClientsByRestaurant(restaurantId: string): Promise<Client[]> {
    return this.repository.findByRestaurant(restaurantId);
  }

  async searchClients(restaurantId: string, query: string): Promise<Client[]> {
    if (!query || query.trim().length === 0) {
      return this.getClientsByRestaurant(restaurantId);
    }
    return this.repository.searchByPhoneOrName(restaurantId, query.trim());
  }

  async getClientByExactPhone(restaurantId: string, phone: string): Promise<Client | null> {
    return this.repository.findByExactPhone(restaurantId, phone.trim());
  }

  async upsertClientByPhone(restaurantId: string, phone: string, data: Partial<Client>): Promise<Client> {
    const existing = await this.getClientByExactPhone(restaurantId, phone);
    if (existing) {
      // Update existing if new info is provided
      const updates: Partial<Client> = {};
      if (data.name && data.name !== existing.name) updates.name = data.name;
      if (data.address && data.address !== existing.address) updates.address = data.address;
      if (data.city && data.city !== existing.city) updates.city = data.city;
      if (data.neighborhood && data.neighborhood !== existing.neighborhood) updates.neighborhood = data.neighborhood;
      if (data.birthDate && (!existing.birthDate || data.birthDate.getTime() !== existing.birthDate.getTime())) {
        updates.birthDate = data.birthDate;
      }
      
      if (Object.keys(updates).length > 0 && this.repository.update) {
        return this.repository.update(existing.id, updates) as Promise<Client>;
      }
      return existing;
    } else {
      // Create new
      return this.repository.create({
        restaurantId,
        phone: phone.trim(),
        name: data.name || 'Cliente sin nombre',
        address: data.address,
        neighborhood: data.neighborhood,
        city: data.city,
        birthDate: data.birthDate,
      });
    }
  }
}
