import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { setupRoutes } from './infrastructure/routes/api';
import { Server as SocketIOServer } from 'socket.io';
import { notFoundHandler } from './api/middlewares/NotFoundHandler';
import { errorHandler } from './api/middlewares/ErrorHandler';

// Nota: esta factory no la usa server.ts (que arma su propio Express con más
// middlewares de seguridad — rate limiting, CORS estricto, xssCleaner). Se
// deja funcional y con el mismo manejo de errores por si en el futuro se usa
// para tests o algún otro entrypoint, para que no quede desactualizada.
export const createApp = (io: SocketIOServer) => {
  const app = express();

  // Security best practices
  app.disable('x-powered-by'); // Hide Express
  app.use(helmet()); // Secure HTTP headers

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  app.use('/api', setupRoutes(io));

  // Deben ir al final, después de todas las rutas.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
