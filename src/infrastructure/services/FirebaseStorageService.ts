import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getStorage, getDownloadURL } from 'firebase-admin/storage';
import { randomUUID } from 'crypto';
import { procesarImagen, ImageFolder } from './ImageProcessor';

/**
 * Guarda las imágenes del menú en Firebase Storage.
 *
 * Antes vivían dentro de PostgreSQL como texto base64: la base guardaba la
 * foto entera y el servidor se la enviaba completa a cada cliente que abría
 * la carta. Ahora la base guarda una URL y el archivo lo sirve el CDN de
 * Firebase, con caché en el navegador del cliente.
 *
 * Sube el backend y no el navegador a propósito. Las reglas de seguridad de
 * Storage solo entienden Firebase Auth, no el JWT propio de Menú 360, así que
 * dejar escribir al navegador obligaría a montar tokens personalizados de
 * Firebase únicamente para eso. Pasando por acá la autorización es la que ya
 * existe (authenticateToken + requireRole) y el bucket queda cerrado a
 * escritura para todo el mundo: el SDK de administrador no pasa por las
 * reglas, así que este servicio sigue pudiendo escribir.
 */

/** Nombres de las variables de Firebase que faltan o están vacías. */
export function credencialesFaltantes(): string[] {
  return [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_STORAGE_BUCKET',
  ].filter((k) => !(process.env[k] || '').trim());
}

function app(): App {
  // getApps() evita reinicializar en cada recarga de nodemon, que si no lanza
  // "The default Firebase app already exists".
  const existentes = getApps();
  if (existentes.length) return existentes[0];

  const faltantes = credencialesFaltantes();
  if (faltantes.length) {
    // Se nombran solo las que faltan. Listar las cuatro siempre obligaba a
    // revisarlas una por una para descubrir cuál era la del problema.
    throw new Error(
      `Faltan credenciales de Firebase en backend/.env: ${faltantes.join(', ')}. ` +
        'Revisa que estén escritas con ese nombre exacto y que hayas reiniciado el ' +
        'servidor después de editar el .env (nodemon solo vigila archivos .ts, así ' +
        'que un cambio en .env no lo reinicia solo).'
    );
  }

  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, FIREBASE_STORAGE_BUCKET } = process.env as Record<string, string>;

  return initializeApp({
    credential: cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      // dotenv entrega los saltos de línea de la clave como la secuencia
      // literal \n; el SDK necesita saltos de verdad.
      privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
    // Sin gs:// por delante: el SDK espera solo el nombre del bucket.
    storageBucket: FIREBASE_STORAGE_BUCKET.replace(/^gs:\/\//, ''),
  });
}

export interface ResultadoSubida {
  url: string;
  /** Solo para los platos; el resto de imágenes ya son pequeñas. */
  thumbnailUrl: string | null;
}

export class FirebaseStorageService {
  private get bucket() {
    return getStorage(app()).bucket();
  }

  /**
   * Procesa y sube una imagen. Devuelve la URL pública y, cuando aplica, la
   * de su miniatura.
   *
   * La ruta lleva el restaurantId por delante para que las imágenes de cada
   * negocio queden agrupadas: así se puede borrar la carpeta entera cuando un
   * restaurante se da de baja, y se ve de un vistazo quién consume el
   * almacenamiento.
   */
  async upload(buffer: Buffer, restaurantId: string, folder: ImageFolder): Promise<ResultadoSubida> {
    const { original, miniatura, contentType, extension } = await procesarImagen(buffer, folder);

    const id = randomUUID();
    const carpeta = `restaurantes/${restaurantId}/${folder}`;

    const [url, thumbnailUrl] = await Promise.all([
      this.guardar(`${carpeta}/${id}.${extension}`, original, contentType),
      miniatura ? this.guardar(`${carpeta}/${id}_mini.${extension}`, miniatura, contentType) : Promise.resolve(null),
    ]);

    return { url, thumbnailUrl };
  }

  private async guardar(ruta: string, contenido: Buffer, contentType: string): Promise<string> {
    const archivo = this.bucket.file(ruta);
    await archivo.save(contenido, {
      contentType,
      metadata: {
        // Un año de caché, y se puede porque el nombre es un UUID: cambiar la
        // foto de un plato crea una ruta nueva, nunca se sobrescribe esta.
        // Es la palanca más grande que hay sobre el costo, porque en Firebase
        // lo caro es la descarga y esto evita volver a descargar.
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });
    return getDownloadURL(archivo);
  }

  /**
   * Borra una imagen y su miniatura a partir de la URL guardada en la base.
   *
   * Silencioso si el archivo ya no está: que falle un borrado no debe tumbar
   * la operación que le importa al usuario, que es guardar su plato. Se
   * registra en consola para poder revisarlo después.
   */
  async deleteByUrl(url: string | null | undefined): Promise<void> {
    const ruta = this.rutaDesdeUrl(url);
    if (!ruta) return;

    const rutas = [ruta];
    // La miniatura es la misma ruta con _mini antes de la extensión. Se
    // deduce en vez de guardarse para no depender de que quien llame se
    // acuerde de pasar las dos.
    const mini = ruta.replace(/(\.[a-z0-9]+)$/i, '_mini$1');
    if (mini !== ruta) rutas.push(mini);

    await Promise.all(
      rutas.map(async (r) => {
        try {
          await this.bucket.file(r).delete();
        } catch (e: any) {
          // 404 es lo normal al intentar borrar la miniatura de una imagen
          // que no tiene, así que no se registra.
          if (e?.code !== 404) {
            console.error(`[storage] no se pudo borrar ${r}:`, e?.message || e);
          }
        }
      })
    );
  }

  /**
   * Extrae la ruta interna de una URL de descarga de Firebase.
   *
   * Devuelve null para cualquier otra cosa —incluido un data URL de los que
   * guardaba la versión anterior—, que es lo que hace que deleteByUrl sea
   * seguro de llamar con lo que sea que haya en la base.
   */
  private rutaDesdeUrl(url: string | null | undefined): string | null {
    if (!url || !url.includes('firebasestorage.googleapis.com')) return null;
    const m = /\/o\/([^?]+)/.exec(url);
    if (!m) return null;
    const ruta = decodeURIComponent(m[1]);
    // Defensa en profundidad: una ruta que no empiece por restaurantes/ no
    // salió de este servicio, y no la vamos a borrar por si acaso.
    return ruta.startsWith('restaurantes/') ? ruta : null;
  }
}

export const firebaseStorage = new FirebaseStorageService();
