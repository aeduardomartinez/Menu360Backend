// Carga de backend/.env ANTES que cualquier otra cosa.
//
// Hasta ahora nadie llamaba a dotenv en todo el proyecto: DATABASE_URL y
// JWT_SECRET funcionaban de rebote, porque al importarse el cliente de Prisma
// lee el .env por su cuenta. Eso dejaba la configuración del servidor
// dependiendo de un efecto secundario de una librería ajena, y explicaba que
// las credenciales de Firebase no aparecieran: se leen en el momento de subir
// una imagen, y para entonces process.env solo tenía lo que Prisma quiso
// cargar. Va en la primera línea porque los imports se evalúan en orden y
// cualquier módulo que lea process.env al cargarse debe encontrarlo ya listo.
import 'dotenv/config';

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
import { notFoundHandler } from './api/middlewares/NotFoundHandler';
import { errorHandler } from './api/middlewares/ErrorHandler';
import { logger } from './shared/utils/logger';
import { credencialesFaltantes } from './infrastructure/services/FirebaseStorageService';

const PORT = process.env.PORT || 4000;

const app = express();

// === DETRÁS DEL PROXY DE RENDER ===
//
// Render (como Heroku, Fly o cualquier hosting con TLS gestionado) atiende al
// cliente y reenvía la petición a la aplicación por HTTP interno. Sin esto,
// Express ve como IP de origen la del proxy, la misma para todo el mundo, con
// dos consecuencias serias: el rate limit trataría a todos los clientes del
// planeta como una sola IP —de modo que 300 peticiones de cualquiera dejarían
// fuera al resto— y express-rate-limit además detecta la cabecera
// X-Forwarded-For sin trust proxy y lanza un ValidationError.
//
// El valor es 1 y no `true`: significa "confía en un único salto de proxy, el
// que tengo delante". Con `true` se confiaría en toda la cadena de
// X-Forwarded-For, que la escribe el cliente, y cualquiera podría falsear su
// IP para saltarse el rate limit.
app.set('trust proxy', 1);

// HTTPS solo si se le pasan certificados propios. En Render (y en cualquier
// hosting con TLS gestionado) NO se usa: el proxy termina el TLS y habla con
// la aplicación por HTTP interno, así que montar HTTPS acá rompería el enlace.
// Se conserva para quien despliegue en un servidor propio.
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

// === CORS ===
//
// Antes esto estaba cableado a localhost y además aceptaba cualquier origen
// que empezara por http://localhost, 127.0.0.1 o 192.168. Eso servía en
// desarrollo pero en producción tiene dos problemas: el frontend desplegado
// quedaría bloqueado, y cualquier página que un atacante sirviera desde su
// propia red local podría llamar a la API del restaurante.
//
// Ahora los orígenes de producción salen de ALLOWED_ORIGINS (lista separada
// por comas). En desarrollo se siguen aceptando los puertos locales, porque
// ahí el riesgo no existe y obligar a configurar la variable solo estorba.
const esProduccion = process.env.NODE_ENV === 'production';

const origenesConfigurados = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

if (esProduccion && origenesConfigurados.length === 0) {
  // Sin esto el servidor arrancaría rechazando a su propio frontend, y el
  // síntoma —peticiones que fallan sin mensaje claro en el navegador— es de
  // los más difíciles de diagnosticar. Mejor no arrancar.
  throw new Error(
    'ALLOWED_ORIGINS no está configurado. En producción debe listar los dominios del ' +
      'frontend separados por comas, por ejemplo: https://menu360.onrender.com,https://menu360.com'
  );
}

const origenPermitido = (origin: string): boolean => {
  const limpio = origin.replace(/\/$/, '');
  if (origenesConfigurados.includes(limpio)) return true;
  // Puertos locales solo fuera de producción.
  if (!esProduccion && /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?$/.test(limpio)) {
    return true;
  }
  return false;
};

const corsOptions = {
  origin: function (origin: any, callback: any) {
    // Sin cabecera Origin son peticiones que no vienen de una página web
    // (curl, apps móviles, health checks del propio Render). CORS no las
    // protege de ninguna manera, así que bloquearlas no aportaría seguridad
    // y sí rompería el health check.
    if (!origin) return callback(null, true);

    if (origenPermitido(origin)) return callback(null, true);

    logger.warn('Petición bloqueada por CORS', { origin });
    return callback(new Error('Bloqueado por CORS: Origen no autorizado'));
  },
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  credentials: true,
};

const io = new SocketIOServer(httpServer, {
  cors: corsOptions
});

// Health check. Va lo primero, antes del rate limit, porque Render lo consulta
// de forma continua para decidir si el servicio está vivo y no tiene sentido
// que esas consultas gasten el cupo de peticiones de nadie. No toca la base de
// datos a propósito: debe responder incluso si Postgres está caído, para que
// Render no reinicie el servicio en bucle por una caída de la base.
app.get('/health', (_req, res) => res.status(200).json({ ok: true }));

// === MIDDLEWARES DE SEGURIDAD ===
// Helmet inyecta cabeceras HTTP de seguridad (esconde que usamos Express, protege contra XSS, etc.)
app.use(helmet());

// Aplicar CORS
app.use(cors(corsOptions));

// Aplicar límite de peticiones a todas las rutas
app.use(generalLimiter);

// === LIMITAR TAMAÑO DE PAYLOAD ===
// Estaba en 50mb porque las imágenes viajaban dentro del JSON como base64.
// Ahora van a Firebase Storage por POST /api/uploads (multipart, con su
// propio tope en multer) y el JSON solo lleva URLs, así que 1mb sobra para
// el pedido más largo. Dejarlo en 50mb sería regalarle a cualquiera la
// posibilidad de ocupar 50mb de memoria del servidor por petición.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));

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

// A partir de acá, manejo de errores global: cualquier ruta que no exista
// cae en notFoundHandler, y cualquier error (de una ruta real o del propio
// notFoundHandler) termina en errorHandler, que es quien realmente responde
// al cliente y deja el registro completo en el log. Deben ir SIEMPRE al
// final, después de montar todas las rutas.
app.use(notFoundHandler);
app.use(errorHandler);

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// El '0.0.0.0' es necesario en Render: si el proceso escuchara solo en
// localhost, el proxy no podría alcanzarlo y el despliegue quedaría colgado en
// "Port scan timeout".
httpServer.listen(Number(PORT), '0.0.0.0', () => {
  const protocol = (process.env.SSL_KEY_PATH && process.env.SSL_CERT_PATH) ? 'HTTPS' : 'HTTP';
  console.log(`🔒 Server is running on port ${PORT} using ${protocol}`);
  logger.info(`Server is running on port ${PORT} using ${protocol}`);

  // Aviso al arrancar si Firebase Storage no está configurado. No se tumba el
  // servidor por esto: un restaurante puede seguir tomando pedidos sin poder
  // cambiar fotos. Pero sin el aviso el problema solo se descubría al intentar
  // subir una imagen, con un 500 en pantalla y el motivo enterrado en el log.
  const faltanFirebase = credencialesFaltantes();
  if (faltanFirebase.length) {
    const aviso =
      `Firebase Storage no está configurado: faltan ${faltanFirebase.join(', ')} en backend/.env. ` +
      'La subida de imágenes fallará hasta que estén. Recuerda reiniciar el servidor ' +
      'después de editar el .env: nodemon solo vigila archivos .ts.';
    console.warn(`⚠️  ${aviso}`);
    logger.warn(aviso);
  } else {
    console.log('✅ Firebase Storage configurado');
  }
});

// === MANEJO GLOBAL DE ERRORES A NIVEL DE PROCESO ===
// Sin esto, una promesa rechazada sin .catch() en cualquier parte del código
// (no solo en una ruta Express) se perdía en silencio, y una excepción
// realmente no capturada podía tumbar el servidor sin dejar ningún rastro.

// Una promesa rechazada que nadie capturó. No tumbamos el proceso por esto
// (Node por defecto solo la advierte y sigue corriendo) pero sí queda
// registrada, en vez de perderse en la consola.
process.on('unhandledRejection', (reason: any) => {
  logger.error('Unhandled Promise Rejection (promesa rechazada sin capturar)', {
    message: reason?.message || String(reason),
    stack: reason?.stack,
  });
});

// Una excepción que se escapó de todo try/catch deja al proceso en un estado
// potencialmente corrupto (buena práctica estándar de Node/Express): se
// registra completa y se cierra el proceso de forma controlada. En
// desarrollo, nodemon lo reinicia solo; en producción debe correr detrás de
// un supervisor de procesos (pm2, systemd, el propio hosting) que también lo
// reinicie — si hoy no hay uno configurado, esto es lo próximo a resolver
// antes de producción, porque si no, un uncaughtException deja el servicio
// caído hasta que alguien lo note y lo reinicie a mano.
process.on('uncaughtException', (err: Error) => {
  logger.error('Uncaught Exception (excepción no capturada) — cerrando el proceso', {
    message: err?.message,
    stack: err?.stack,
  });
  process.exit(1);
});
