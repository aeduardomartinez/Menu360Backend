import { Router } from 'express';
import { SuperAdminController } from '../controllers/SuperAdminController';
import { authenticateToken } from '../middlewares/AuthMiddleware';

const router = Router();

// Protect all routes
router.use(authenticateToken);

router.post('/restaurants', SuperAdminController.createRestaurant);
router.get('/restaurants', SuperAdminController.getRestaurants);
router.delete('/restaurants/:id', SuperAdminController.deleteRestaurant);

export default router;
