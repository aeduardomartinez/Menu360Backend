import http from 'http';
import express from 'express';
// Trigger restart for new prisma client again
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Server as SocketIOServer } from 'socket.io';
import { setupRoutes } from './infrastructure/routes/api';

const PORT = process.env.PORT || 4000;

const app = express();
const httpServer = http.createServer(app);

// === SEGURIDAD: RATE LIMITING ===
// Límite general para evitar DDoS (máximo 300 peticiones cada 5 minutos por IP)
const generalLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 300,
  message: { error: 'Demasiadas peticiones desde esta IP, por favor intenta de nuevo después de 5 minutos' }
});

// === SEGURIDAD: CORS (Cross-Origin Resource Sharing) ===
/* 
  INSTRUCCIONES PARA PRODUCCIÓN:
  Actualmente origin está en '*' (permite peticiones desde CUALQUIER lugar).
  Cuando vayas a salir a producción (menu360.com o .es), descomenta la siguiente lista 
  y reemplaza en app.use(cors(...)) y en la configuración de Socket.io.
  
  const allowedOrigins = ['https://menu360.com', 'https://www.menu360.com', 'http://localhost:5173'];
  const corsOptions = {
    origin: function (origin: any, callback: any) {
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('No permitido por CORS'));
      }
    },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']
  };
*/
// Para pruebas por ahora, lo mantenemos abierto, pero YA TIENES el código arriba para limitarlo.
const corsOptions = {
  origin: '*', 
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']
};

const io = new SocketIOServer(httpServer, {
  cors: corsOptions
});

// === MIDDLEWARES DE SEGURIDAD ===
// Helmet inyecta cabeceras HTTP de seguridad (esconde que usamos Express, protege contra XSS, etc.)
app.use(helmet());

// Aplicar CORS
app.use(cors(corsOptions));

// Aplicar límite de peticiones a todas las rutas
app.use(generalLimiter);

// === LIMITAR TAMAÑO DE PAYLOAD ===
// Reducimos el límite a 2mb para evitar ataques de agotamiento de memoria (DDoS de payload enorme)
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ limit: '2mb', extended: true }));

app.use('/api', setupRoutes(io));

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
