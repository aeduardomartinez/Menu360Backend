import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { authenticateToken } from '../middlewares/AuthMiddleware';

const router = Router();

// Public routes
router.post('/login', AuthController.login);

// Protected routes (require token)
router.get('/me', authenticateToken, AuthController.me);
router.post('/staff', authenticateToken, AuthController.createStaff);
router.get('/staff', authenticateToken, AuthController.getStaff);
router.put('/staff/:id', authenticateToken, AuthController.updateStaff);
router.delete('/staff/:id', authenticateToken, AuthController.deleteStaff);

export default router;
