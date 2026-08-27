import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { authenticateToken } from '../middlewares/AuthMiddleware';
import rateLimit from 'express-rate-limit';

const router = Router();

// === SEGURIDAD: LIMITADOR DE LOGIN ===
// Máximo 5 intentos por ventana de 15 minutos por IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // Aumentado temporalmente para desarrollo
  message: { error: 'Demasiados intentos de inicio de sesión. Por favor, inténtalo de nuevo en 15 minutos.' }
});

// Public routes
router.post('/login', loginLimiter, AuthController.login);

// Protected routes (require token)
router.get('/me', authenticateToken, AuthController.me);
router.post('/staff', authenticateToken, AuthController.createStaff);
router.get('/staff', authenticateToken, AuthController.getStaff);
router.put('/staff/:id', authenticateToken, AuthController.updateStaff);
router.delete('/staff/:id', authenticateToken, AuthController.deleteStaff);

export default router;
