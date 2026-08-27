import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { setupRoutes } from './infrastructure/routes/api';
import { Server as SocketIOServer } from 'socket.io';

export const createApp = (io: SocketIOServer) => {
  const app = express();
  
  // Security best practices
  app.disable('x-powered-by'); // Hide Express
  app.use(helmet()); // Secure HTTP headers
  
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  app.use('/api', setupRoutes(io));

  // Global Error Handler can be added here

  return app;
};
