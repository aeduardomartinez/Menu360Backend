import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, UserRole } from '../../domain/models/User';
import { PrismaUserRepository } from '../../infrastructure/repositories/PrismaUserRepository';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-dev';
const JWT_EXPIRES_IN = '24h';


export class AuthService {
  private userRepository: PrismaUserRepository;

  constructor() {
    this.userRepository = new PrismaUserRepository();
    this.seedDemoAdmin();
  }

  private async seedDemoAdmin() {
    try {
      await this.createUser('Admin Demo', 'admin@demo.com', 'admin123', 'ADMIN', 'rest-1');
      console.log('Demo admin user created: admin@demo.com / admin123');
    } catch (e) {
      console.log('Demo admin user already exists');
    }
  }

  getUserRepository() {
    return this.userRepository;
  }

  async login(email: string, password: string) {
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      throw new Error('Invalid email or password');
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      throw new Error('Invalid email or password');
    }

    if (user.role !== 'SUPERADMIN' && user.restaurantId) {
      const restaurant = await prisma.restaurant.findUnique({ where: { id: user.restaurantId } });
      if (restaurant?.isBlocked) {
        throw new Error('La cuenta ha sido suspendida por falta de pago. Por favor contacte a soporte.');
      }
    }

    const token = jwt.sign(
      { 
        userId: user.id, 
        restaurantId: user.restaurantId, 
        email: user.email, 
        role: user.role 
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return {
      token,
      user: {
        id: user.id,
        restaurantId: user.restaurantId,
        name: user.name,
        email: user.email,
        role: user.role
      }
    };
  }

  async createUser(
    name: string, 
    email: string, 
    password: string, 
    role: UserRole, 
    restaurantId: string,
    lastName?: string,
    phone?: string,
    vehiclePlate?: string
  ): Promise<User> {
    const existingUser = await this.userRepository.findByEmail(email);
    if (existingUser) {
      throw new Error('Email is already registered');
    }

    const { randomUUID } = require('crypto');
    const passwordHash = await bcrypt.hash(password, 10);
    const newUser: User = {
      id: randomUUID(),
      restaurantId,
      name,
      lastName,
      email,
      phone,
      vehiclePlate,
      passwordHash,
      role,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    return await this.userRepository.save(newUser);
  }

  async updateUser(id: string, restaurantId: string, updates: { name?: string; email?: string; password?: string }): Promise<User> {
    const user = await this.userRepository.findById(id);
    if (!user || user.restaurantId !== restaurantId) {
      throw new Error('User not found');
    }

    if (updates.email && updates.email !== user.email) {
      const existingUser = await this.userRepository.findByEmail(updates.email);
      if (existingUser) {
        throw new Error('Email is already in use');
      }
      user.email = updates.email;
    }

    if (updates.name) {
      user.name = updates.name;
    }

    if (updates.password) {
      user.passwordHash = await bcrypt.hash(updates.password, 10);
    }

    user.updatedAt = new Date();
    return await this.userRepository.save(user);
  }
}

// Singleton instance
export const authService = new AuthService();
