import { Router } from 'express';
import { SuperAdminController } from '../controllers/SuperAdminController';
import { authenticateToken } from '../middlewares/AuthMiddleware';

const router = Router();

// Protect all routes
router.use(authenticateToken);

router.post('/restaurants', SuperAdminController.createRestaurant);
router.get('/restaurants', SuperAdminController.getRestaurants);
router.delete('/restaurants/:id', SuperAdminController.deleteRestaurant);
router.put('/restaurants/:id/plan', SuperAdminController.updateRestaurantPlan);
router.put('/restaurants/:id/billing', SuperAdminController.updateRestaurantBilling);

export default router;
