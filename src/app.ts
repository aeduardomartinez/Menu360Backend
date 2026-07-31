import express from 'express';
import cors from 'cors';
import { setupRoutes } from './infrastructure/routes/api';
import { Server as SocketIOServer } from 'socket.io';

export const createApp = (io: SocketIOServer) => {
  const app = express();
  
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  app.use('/api', setupRoutes(io));

  // Global Error Handler can be added here

  return app;
};
