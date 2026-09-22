import fs from 'fs';
import path from 'path';

/**
 * Logger mínimo, sin dependencias nuevas (no se pudo correr `npm install` al
 * escribir esto). Escribe siempre a consola (para verlo en vivo / en los
 * logs del hosting) y además a un archivo por día dentro de backend/logs/,
 * para tener historial persistente entre reinicios — algo que antes no
 * existía: un error solo se veía si alguien tenía la terminal abierta en
 * ese momento exacto.
 *
 * `process.cwd()` en vez de `__dirname` porque el proceso siempre se levanta
 * desde la carpeta backend/ (tanto con `ts-node src/server.ts` en desarrollo
 * como con el build compilado en dist/), así el archivo cae siempre en
 * backend/logs/ sin importar si se ejecuta el .ts o el .js compilado.
 */
const LOG_DIR = path.join(process.cwd(), 'logs');

function ensureLogDir(): void {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  } catch (e) {
    // Si ni siquiera se puede crear la carpeta de logs, seguimos funcionando
    // solo con consola: un problema de logging nunca debe tumbar el servidor.
    console.error('[logger] No se pudo crear la carpeta de logs:', e);
  }
}
ensureLogDir();

function todayFile(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return path.join(LOG_DIR, `${yyyy}-${mm}-${dd}.log`);
}

type LogLevel = 'INFO' | 'WARN' | 'ERROR';

function write(level: LogLevel, message: string, meta?: Record<string, any>): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(meta && Object.keys(meta).length > 0 ? { meta } : {}),
  };
  const line = JSON.stringify(entry);

  if (level === 'ERROR') console.error(line);
  else if (level === 'WARN') console.warn(line);
  else console.log(line);

  // Escritura a disco asíncrona y "fire and forget": si falla, se avisa por
  // consola pero nunca se rompe el request/proceso por esto.
  fs.appendFile(todayFile(), line + '\n', (err) => {
    if (err) console.error('[logger] No se pudo escribir en el log de archivo:', err);
  });
}

export const logger = {
  info: (message: string, meta?: Record<string, any>) => write('INFO', message, meta),
  warn: (message: string, meta?: Record<string, any>) => write('WARN', message, meta),
  error: (message: string, meta?: Record<string, any>) => write('ERROR', message, meta),
};
