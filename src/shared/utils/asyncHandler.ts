import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Express 4 no captura automáticamente un `throw` (ni un reject) dentro de un
 * controlador async: si alguien olvida el try/catch, el error se queda
 * colgado y la petición del cliente nunca responde (o el proceso se cae).
 * Este wrapper reenvía cualquier error al middleware de errores centralizado
 * (ErrorHandler.ts) con next(err), sin tener que repetir try/catch en cada
 * controlador nuevo.
 *
 * Uso: router.get('/algo', asyncHandler(async (req, res) => { ... }));
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
