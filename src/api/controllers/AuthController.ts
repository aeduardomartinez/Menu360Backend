import { Request, Response } from 'express';
import { authService } from '../../application/services/AuthService';
import { UserRole } from '../../domain/models/User';

export const AuthController = {
  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const result = await authService.login(email, password);
      return res.status(200).json(result);
    } catch (error: any) {
      if (error.message?.includes("Can't reach database server") || error.code === 'P1001' || error.message?.includes('ECONNREFUSED')) {
        return res.status(503).json({ error: 'No hay conexión con la base de datos. Por favor, intenta de nuevo más tarde.' });
      }
      return res.status(401).json({ error: error.message });
    }
  },

  async me(req: Request, res: Response) {
    // req.user is set by authenticateToken middleware
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    return res.status(200).json(req.user);
  },

  async createStaff(req: Request, res: Response) {
    try {
      const { name, lastName, email, password, role, phone, vehiclePlate } = req.body;
      const adminRestaurantId = req.user?.restaurantId;
      const adminRole = req.user?.role;

      if (!adminRestaurantId || adminRole !== 'ADMIN') {
        return res.status(403).json({ error: 'Only admins can create staff' });
      }

      if (!email || !password || !name || !role) {
        return res.status(400).json({ error: 'Name, email, password, and role are required' });
      }

      const allowedRoles = ['CASHIER', 'DELIVERY', 'WAITRESS', 'KITCHEN'];
      if (!allowedRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }

      // Validar según el plan
      const prisma = new (require('@prisma/client').PrismaClient)();
      const restaurant = await prisma.restaurant.findUnique({ where: { id: adminRestaurantId } });
      if (restaurant?.planType === 'BASIC' && (role === 'WAITRESS' || role === 'KITCHEN')) {
        return res.status(403).json({ error: 'Tu plan actual no permite crear este tipo de usuarios' });
      }

      const newUser = await authService.createUser(
        name, 
        email, 
        password, 
        role as UserRole, 
        adminRestaurantId,
        lastName,
        phone,
        vehiclePlate
      );
      
      // Don't return passwordHash
      const { passwordHash, ...userWithoutPassword } = newUser;
      return res.status(201).json(userWithoutPassword);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  },
  
  async getStaff(req: Request, res: Response) {
    try {
      const adminRestaurantId = req.user?.restaurantId;
      const adminRole = req.user?.role;

      if (!adminRestaurantId) {
        return res.status(403).json({ error: 'Not associated with a restaurant' });
      }
      
      const allowedRoles = ['ADMIN', 'CASHIER', 'WAITRESS'];
      if (!adminRole || !allowedRoles.includes(adminRole)) {
        return res.status(403).json({ error: 'Unauthorized to view staff' });
      }

      const users = await authService.getUserRepository().findByRestaurantId(adminRestaurantId);
      // Filter out passwords
      const safeUsers = users.map(u => {
        const { passwordHash, ...safe } = u;
        return safe;
      });
      
      return res.status(200).json(safeUsers);
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  },

  async deleteStaff(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const adminRestaurantId = req.user?.restaurantId;
      const adminRole = req.user?.role;

      if (!adminRestaurantId || adminRole !== 'ADMIN') {
        return res.status(403).json({ error: 'Only admins can delete staff' });
      }

      const userToDelete = await authService.getUserRepository().findById(id);
      if (!userToDelete || userToDelete.restaurantId !== adminRestaurantId) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (userToDelete.role === 'ADMIN') {
        return res.status(403).json({ error: 'Cannot delete an ADMIN user' });
      }

      await authService.getUserRepository().delete(id);
      return res.status(204).send();
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  },

  async updateStaff(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, email, password } = req.body;
      const adminRestaurantId = req.user?.restaurantId;
      const adminRole = req.user?.role;

      if (!adminRestaurantId || adminRole !== 'ADMIN') {
        return res.status(403).json({ error: 'Only admins can update staff' });
      }

      const updatedUser = await authService.updateUser(id, adminRestaurantId, { name, email, password });
      
      const { passwordHash, ...userWithoutPassword } = updatedUser;
      return res.status(200).json(userWithoutPassword);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  }
};
