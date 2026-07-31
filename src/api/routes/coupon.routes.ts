import { Router } from 'express';
import { CouponController } from '../../infrastructure/controllers/CouponController';
import { authenticateToken } from '../middlewares/AuthMiddleware';

const couponRouter = Router();
const couponController = new CouponController();

// Public route for clients
couponRouter.post('/validate', couponController.validateCoupon);

// Protected routes for Admin
couponRouter.get('/:restaurantId', authenticateToken, couponController.getCoupons);
couponRouter.post('/:restaurantId', authenticateToken, couponController.createCoupon);
couponRouter.patch('/:id/toggle', authenticateToken, couponController.toggleCoupon);
couponRouter.delete('/:id', authenticateToken, couponController.deleteCoupon);

export default couponRouter;
