import { PrismaClient } from '@prisma/client';
import { Client } from '../../domain/models/Client';
import { IClientRepository } from '../../domain/repositories/IClientRepository';
import { prisma } from '../db/prisma';

export class PrismaClientRepository implements IClientRepository {
  async create(client: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>): Promise<Client> {
    const data: any = { ...client };
    return prisma.client.create({
      data
    });
  }

  async findById(id: string): Promise<Client | null> {
    return prisma.client.findUnique({ where: { id } });
  }

  async findByRestaurant(restaurantId: string): Promise<Client[]> {
    return prisma.client.findMany({
      where: { restaurantId },
      orderBy: { name: 'asc' }
    });
  }

  async searchByPhoneOrName(restaurantId: string, query: string): Promise<Client[]> {
    return prisma.client.findMany({
      where: {
        restaurantId,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { phone: { contains: query } }
        ]
      },
      take: 10,
      orderBy: { name: 'asc' }
    });
  }

  async findByExactPhone(restaurantId: string, phone: string): Promise<Client | null> {
    return prisma.client.findFirst({
      where: {
        restaurantId,
        phone
      }
    });
  }

  async update(id: string, updates: Partial<Client>): Promise<Client | null> {
    const data: any = { ...updates };
    return prisma.client.update({
      where: { id },
      data
    });
  }
}
