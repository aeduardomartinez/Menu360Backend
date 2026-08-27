import http from 'http';
import https from 'https';
import fs from 'fs';
import express from 'express';
// Trigger restart for new prisma client again
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Server as SocketIOServer } from 'socket.io';
import { setupRoutes } from './infrastructure/routes/api';
import { xssCleaner } from './api/middlewares/xssCleaner';

const PORT = process.env.PORT || 4000;

const app = express();

let httpServer: http.Server | https.Server;
if (process.env.SSL_KEY_PATH && process.env.SSL_CERT_PATH) {
  const privateKey = fs.readFileSync(process.env.SSL_KEY_PATH, 'utf8');
  const certificate = fs.readFileSync(process.env.SSL_CERT_PATH, 'utf8');
  httpServer = https.createServer({ key: privateKey, cert: certificate }, app);
} else {
  httpServer = http.createServer(app);
}

// === SEGURIDAD: RATE LIMITING ===
// Límite general para evitar DDoS (máximo 300 peticiones cada 5 minutos por IP)
const generalLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 300,
  message: { error: 'Demasiadas peticiones desde esta IP, por favor intenta de nuevo después de 5 minutos' }
});

// CORS Configurado Estrictamente para Localhost (Pruebas Locales)
// Solo permite que el Frontend que corre en Vite en el puerto 5173 (u otros puertos de localhost)
// se conecte al servidor. Rechaza cualquier otro dominio en internet.
const allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const corsOptions = {
  origin: function (origin: any, callback: any) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1 || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1') || origin.startsWith('http://192.168')) {
      callback(null, true);
    } else {
      callback(new Error('Bloqueado por CORS: Origen no autorizado'));
    }
  },
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  credentials: true
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

// Limpiar inyecciones XSS de todo el payload
app.use(xssCleaner);

// === INTERCEPTOR DE ERRORES DE BASE DE DATOS ===
// Captura respuestas de error 500 generadas por los controladores y 
// formatea el mensaje si se detecta un error de conexión de Prisma.
app.use((req, res, next) => {
  const originalJson = res.json;
  res.json = function (body) {
    if (res.statusCode >= 500 && body && body.error && typeof body.error === 'string') {
      const errorStr = body.error.toLowerCase();
      if (
        errorStr.includes('prismaclientinitializationerror') || 
        errorStr.includes('can\'t reach database server') || 
        errorStr.includes('connect to database') || 
        errorStr.includes('connection pool') ||
        errorStr.includes('econnrefused')
      ) {
        body.error = 'No hay conexión con la base de datos. Por favor intenta más tarde o contacta al administrador.';
      }
    }
    return originalJson.call(this, body);
  };
  next();
});

app.use('/api', setupRoutes(io));

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

httpServer.listen(PORT, () => {
  const protocol = (process.env.SSL_KEY_PATH && process.env.SSL_CERT_PATH) ? 'HTTPS' : 'HTTP';
  console.log(`🔒 Server is running on port ${PORT} using ${protocol}`);
});
