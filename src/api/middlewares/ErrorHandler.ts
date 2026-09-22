import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../shared/errors/AppError';
import { logger } from '../../shared/utils/logger';

/**
 * Middleware de errores centralizado (los 4 parámetros son lo que le dice a
 * Express que esto es un error handler, no una ruta normal). Debe registrarse
 * SIEMPRE al final, después de todas las rutas — es la red de seguridad para
 * cualquier error que un controlador no haya atrapado él mismo con su propio
 * try/catch.
 *
 * No reemplaza los try/catch que ya existen en los controladores (esos
 * siguen funcionando igual y devolviendo su propio mensaje); esto cubre lo
 * que hoy no tiene ninguna red: un error en un middleware, un bug realmente
 * inesperado, o un controlador nuevo que se le olvide el try/catch (si usa
 * asyncHandler, cae aquí solo).
 */
export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction): void {
  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : 500;

  // El error completo (con stack) siempre se registra en el servidor, sin
  // importar qué tanto de eso se le muestre al cliente.
  logger.error(err?.message || 'Error no controlado', {
    statusCode,
    method: req.method,
    path: req.originalUrl,
    restaurantId: req.user?.restaurantId,
    userId: req.user?.userId,
    isOperational: isAppError,
    stack: err?.stack,
  });

  // Un AppError es un error "esperado" del negocio (datos inválidos, no
  // encontrado, sin permiso, etc.) y su mensaje ya está pensado para
  // mostrarse tal cual. Cualquier otra cosa es un bug/excepción real: no se
  // le filtran al cliente detalles internos (nombres de tablas, rutas,
  // mensajes de Prisma, etc.), solo un mensaje genérico.
  const message = isAppError
    ? err.message
    : 'Ocurrió un error inesperado en el servidor. Por favor intenta de nuevo o contacta al administrador.';

  if (res.headersSent) {
    // Ya se empezó a responder (por ejemplo un stream) — no se puede mandar
    // otro res.status/json, solo dejar que Express cierre la conexión.
    return;
  }

  res.status(statusCode).json({
    error: message,
    code: isAppError ? err.code : 'INTERNAL_ERROR',
  });
}
