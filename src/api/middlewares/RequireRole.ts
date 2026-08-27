import { Request, Response, NextFunction } from 'express';

export const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // req.user is populated by authenticateToken middleware
    const userRole = req.user?.role;

    if (!userRole) {
      return res.status(403).json({ error: 'Access denied. Role not found.' });
    }

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ error: `Access denied. Requires one of: ${allowedRoles.join(', ')}` });
    }

    next();
  };
};
