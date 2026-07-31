import { Request, Response } from 'express';
import { prisma } from '../../infrastructure/db/prisma';
import bcrypt from 'bcryptjs';

export const SuperAdminController = {
  async createRestaurant(req: Request, res: Response) {
    try {
      const { restaurantName, ownerName, ownerEmail, password } = req.body;
      const userRole = req.user?.role;

      if (userRole !== 'SUPERADMIN') {
        return res.status(403).json({ error: 'Solo el SUPERADMIN puede crear negocios' });
      }

      if (!restaurantName || !ownerName || !ownerEmail || !password) {
        return res.status(400).json({ error: 'Todos los campos son requeridos' });
      }

      // Validar si el email ya existe
      const existingUser = await prisma.user.findUnique({ where: { email: ownerEmail } });
      if (existingUser) {
        return res.status(400).json({ error: 'El correo electrónico ya está en uso' });
      }

      // Generar slug
      let baseSlug = restaurantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      let slug = baseSlug;
      let counter = 1;
      
      while (await prisma.restaurant.findUnique({ where: { slug } })) {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }

      const passwordHash = await bcrypt.hash(password, 10);

      // Crear Restaurante y Usuario en una transacción
      const result = await prisma.$transaction(async (tx: any) => {
        const newRestaurant = await tx.restaurant.create({
          data: {
            slug,
            name: restaurantName,
            themeColor: '#0d6efd',
            adminThemeColor: '#0d6efd'
          }
        });

        const newAdmin = await tx.user.create({
          data: {
            email: ownerEmail,
            passwordHash,
            name: ownerName,
            role: 'ADMIN',
            restaurantId: newRestaurant.id
          }
        });

        const newBox = await tx.box.create({
          data: {
            name: 'Caja Principal',
            description: 'Caja principal del sistema creada automáticamente',
            restaurantId: newRestaurant.id,
            status: 'CLOSED',
            currentBalance: 0,
            assignedUserId: newAdmin.id
          }
        });

        return { restaurant: newRestaurant, admin: newAdmin, box: newBox };
      });

      const { passwordHash: _, ...adminWithoutPassword } = result.admin;

      return res.status(201).json({
        message: 'Restaurante creado exitosamente',
        restaurant: result.restaurant,
        admin: adminWithoutPassword
      });

    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  async getRestaurants(req: Request, res: Response) {
    try {
      if (req.user?.role !== 'SUPERADMIN') {
        return res.status(403).json({ error: 'Solo el SUPERADMIN puede ver los negocios' });
      }

      const restaurants = await prisma.restaurant.findMany({
        include: {
          users: {
            where: { role: 'ADMIN' },
            select: { id: true, name: true, email: true }
          }
        },
        orderBy: { name: 'asc' }
      });

      return res.status(200).json(restaurants);
    } catch (error: any) {
      console.error('Error fetching restaurants:', error);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  async deleteRestaurant(req: Request, res: Response) {
    try {
      const userRole = req.user?.role;
      if (userRole !== 'SUPERADMIN') {
        return res.status(403).json({ error: 'Solo el SUPERADMIN puede eliminar negocios' });
      }

      const { id } = req.params;

      await prisma.$transaction(async (tx: any) => {
        // Delete all related records first
        await tx.invoice.deleteMany({ where: { restaurantId: id } });
        await tx.financialRecord.deleteMany({ where: { restaurantId: id } });
        await tx.boxSession.deleteMany({ where: { restaurantId: id } });
        await tx.order.deleteMany({ where: { restaurantId: id } });
        
        await tx.product.deleteMany({ where: { restaurantId: id } });
        await tx.category.deleteMany({ where: { restaurantId: id } });
        await tx.modifierCategory.deleteMany({ where: { restaurantId: id } });
        await tx.coupon.deleteMany({ where: { restaurantId: id } });
        await tx.box.deleteMany({ where: { restaurantId: id } });
        
        await tx.user.deleteMany({ where: { restaurantId: id } });
        
        // Finally, delete the restaurant
        await tx.restaurant.delete({ where: { id } });
      });

      return res.status(200).json({ message: 'Restaurante eliminado exitosamente' });
    } catch (error: any) {
      console.error('Error deleting restaurant:', error);
      return res.status(500).json({ error: 'Error interno del servidor al eliminar el restaurante' });
    }
  }
};
