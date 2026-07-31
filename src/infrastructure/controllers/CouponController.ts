import { Request, Response } from 'express';
import { prisma } from '../db/prisma';

export class CouponController {
  
  getCoupons = async (req: Request, res: Response) => {
    try {
      const { restaurantId } = req.params;
      const coupons = await prisma.coupon.findMany({
        where: { restaurantId },
        orderBy: { createdAt: 'desc' }
      });
      res.json(coupons);
    } catch (error) {
      res.status(500).json({ error: 'Error fetching coupons' });
    }
  };

  createCoupon = async (req: Request, res: Response) => {
    try {
      const { restaurantId } = req.params;
      const { code, discountPercentage, isActive } = req.body;
      
      const existing = await prisma.coupon.findFirst({
        where: { restaurantId, code: code.toUpperCase() }
      });

      if (existing) {
        return res.status(400).json({ error: 'Coupon code already exists' });
      }

      const coupon = await prisma.coupon.create({
        data: {
          restaurantId,
          code: code.toUpperCase(),
          discountPercentage,
          isActive: isActive !== undefined ? isActive : true
        }
      });
      res.status(201).json(coupon);
    } catch (error) {
      res.status(500).json({ error: 'Error creating coupon' });
    }
  };

  toggleCoupon = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { isActive } = req.body;
      const coupon = await prisma.coupon.update({
        where: { id },
        data: { isActive }
      });
      res.json(coupon);
    } catch (error) {
      res.status(500).json({ error: 'Error toggling coupon' });
    }
  };

  deleteCoupon = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await prisma.coupon.delete({ where: { id } });
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Error deleting coupon' });
    }
  };

  validateCoupon = async (req: Request, res: Response) => {
    try {
      const { restaurantId, code } = req.body;
      
      // We also check if the restaurant actually has coupons enabled
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { couponsEnabled: true }
      });

      if (!restaurant?.couponsEnabled) {
        return res.status(400).json({ error: 'Coupons are disabled for this restaurant' });
      }

      const coupon = await prisma.coupon.findFirst({
        where: { 
          restaurantId, 
          code: code.toUpperCase(),
          isActive: true
        }
      });

      if (!coupon) {
        return res.status(404).json({ error: 'Invalid or inactive coupon' });
      }

      res.json({
        valid: true,
        code: coupon.code,
        discountPercentage: coupon.discountPercentage
      });
    } catch (error) {
      res.status(500).json({ error: 'Error validating coupon' });
    }
  };
}
