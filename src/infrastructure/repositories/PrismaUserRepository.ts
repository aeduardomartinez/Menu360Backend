import { User, UserRole } from '../../domain/models/User';
import { prisma } from '../db/prisma';

export class PrismaUserRepository {
  async findByEmail(email: string): Promise<User | null> {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return null;
    return this.mapToUser(user);
  }

  async findById(id: string): Promise<User | null> {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return null;
    return this.mapToUser(user);
  }

  async findByRestaurantId(restaurantId: string): Promise<User[]> {
    const users = await prisma.user.findMany({ where: { restaurantId } });
    return users.map(this.mapToUser);
  }

  async save(user: User): Promise<User> {
    const saved = await prisma.user.upsert({
      where: { id: user.id },
      update: {
        name: user.name,
        lastName: user.lastName,
        phone: user.phone,
        vehiclePlate: user.vehiclePlate,
        email: user.email,
        passwordHash: user.passwordHash,
        role: user.role,
        updatedAt: user.updatedAt,
      },
      create: {
        id: user.id,
        restaurantId: user.restaurantId,
        name: user.name,
        lastName: user.lastName,
        phone: user.phone,
        vehiclePlate: user.vehiclePlate,
        email: user.email,
        passwordHash: user.passwordHash,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      }
    });
    return this.mapToUser(saved);
  }

  async delete(id: string): Promise<void> {
    // Prevent foreign key constraint errors by unassigning the user first
    await prisma.box.updateMany({
      where: { assignedUserId: id },
      data: { assignedUserId: null }
    });
    
    await prisma.boxSession.updateMany({
      where: { userId: id },
      data: { userId: null }
    });

    await prisma.user.delete({ where: { id } });
  }

  private mapToUser(data: any): User {
    return {
      ...data,
      name: data.name || undefined,
      lastName: data.lastName || undefined,
      phone: data.phone || undefined,
      vehiclePlate: data.vehiclePlate || undefined,
      role: data.role as UserRole
    };
  }
}
