import { Request, Response, NextFunction } from 'express';
import { NotFoundError } from '../../shared/errors/AppError';

/**
 * Se registra después de todas las rutas: si una petición llegó hasta acá,
 * ninguna ruta la manejó. Antes de esto, una URL mal escrita o un endpoint
 * que ya no existe simplemente devolvía el 404 HTML por defecto de Express
 * (no un JSON consistente como el resto de la API).
 */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError(`Ruta no encontrada: ${req.method} ${req.originalUrl}`));
}
