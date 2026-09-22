import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Sin valor de respaldo a propósito: si JWT_SECRET no está configurado en el
// entorno, preferimos que el servidor falle al arrancar antes que firmar o
// validar sesiones con un secreto adivinable (un secreto de "demo" escrito en
// el código permitiría a cualquiera fabricar un token válido de cualquier
// usuario, incluido un superadministrador).
const JWT_SECRET: string = process.env.JWT_SECRET || (() => {
  throw new Error('JWT_SECRET no está configurado. Defínelo en las variables de entorno antes de iniciar el servidor.');
})();

export interface AuthPayload {
  userId: string;
  restaurantId: string;
  email: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    
    req.user = decoded as AuthPayload;
    next();
  });
};
