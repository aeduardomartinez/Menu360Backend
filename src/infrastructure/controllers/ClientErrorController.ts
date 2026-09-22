import { Request, Response } from 'express';
import { logger } from '../../shared/utils/logger';

/**
 * Recibe errores ocurridos en el navegador (pantalla que se rompe, una
 * petición que falla, una promesa sin capturar) y los deja en el mismo log
 * centralizado del servidor. No exige sesión: un error puede pasar en la
 * página pública del menú antes de que el cliente haga login, y ahí no hay
 * token que mandar.
 *
 * Por eso mismo el restaurantId que llega en el body NO es de confiar como
 * dato de seguridad — es solo contexto de diagnóstico (igual que el resto de
 * este reporte). Si el usuario sí está autenticado, se prioriza el
 * restaurantId del token verificado.
 */
export class ClientErrorController {
  report = (req: Request, res: Response): void => {
    try {
      const { message, stack, url, componentStack, source, restaurantId: bodyRestaurantId } = req.body || {};

      const restaurantId = req.user?.restaurantId || (typeof bodyRestaurantId === 'string' ? bodyRestaurantId : undefined);

      logger.error(`[Frontend] ${String(message || 'Error de frontend sin mensaje').slice(0, 500)}`, {
        source: typeof source === 'string' ? source.slice(0, 100) : 'unknown',
        url: typeof url === 'string' ? url.slice(0, 500) : undefined,
        stack: typeof stack === 'string' ? stack.slice(0, 4000) : undefined,
        componentStack: typeof componentStack === 'string' ? componentStack.slice(0, 4000) : undefined,
        restaurantId,
        userId: req.user?.userId,
        userAgent: req.headers['user-agent'],
      });

      // 204: al frontend no le interesa (ni debe depender de) la respuesta de
      // este endpoint — reportar un error nunca debe generar, a su vez, otro
      // error visible para el usuario.
      res.status(204).end();
    } catch (e) {
      // Si algo falla acá mismo (body raro, etc.), tampoco debe romper nada.
      res.status(204).end();
    }
  };
}
