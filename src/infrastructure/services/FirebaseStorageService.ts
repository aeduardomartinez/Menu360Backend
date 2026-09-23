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

/**
 * Quita las comillas que envuelven un valor de variable de entorno.
 *
 * En local no hacían daño porque dotenv las quita al leer el .env. El panel
 * de Render no interpreta nada: guarda el texto tal cual, comillas incluidas.
 * Por eso una credencial que funciona en tu máquina puede fallar publicada,
 * que es de los errores más desconcertantes que hay.
 */
function limpiar(valor: string): string {
  const v = (valor || '').trim();
  if (v.length > 1 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    return v.slice(1, -1).trim();
  }
  return v;
}

/**
 * Deja la clave privada en PEM válido venga como venga.
 *
 * El SDK se la pasa a OpenSSL, que es estricto con el formato: si algo no
 * cuadra responde `error:1E08010C:DECODER routines::unsupported`, un mensaje
 * que no dice absolutamente nada sobre cuál es el problema real. Y hay tres
 * formas distintas de que se estropee al copiarla a un panel de hosting:
 *
 *  1. Con comillas alrededor (las quita `limpiar`).
 *  2. Con los saltos escritos como la secuencia literal \n, que es como se
 *     guarda dentro del JSON que descarga Firebase.
 *  3. Sin ningún salto de línea, porque el campo del formulario los eliminó
 *     al pegar un valor de varias líneas. Este es el peor, porque a simple
 *     vista en el panel la clave se ve completa y correcta.
 *
 * El tercer caso se repara reconstruyendo el PEM: se toma el base64 de en
 * medio y se vuelve a partir en líneas de 64 caracteres, que es el formato
 * que OpenSSL espera.
 */
function normalizarClavePrivada(bruta: string): string {
  let k = limpiar(bruta);

  k = k.replace(/\\r/g, '').replace(/\\n/g, '\n').replace(/\r/g, '');

  if (!k.includes('\n')) {
    const m = /-----BEGIN ([A-Z ]+)-----\s*([\s\S]*?)\s*-----END \1-----/.exec(k);
    if (m) {
      const cuerpo = m[2].replace(/\s+/g, '');
      const lineas = cuerpo.match(/.{1,64}/g) || [];
      k = `-----BEGIN ${m[1]}-----\n${lineas.join('\n')}\n-----END ${m[1]}-----\n`;
    }
  }

  if (!k.endsWith('\n')) k += '\n';
  return k;
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

  const privateKey = normalizarClavePrivada(FIREBASE_PRIVATE_KEY);

  // Si después de normalizar sigue sin parecer un PEM, el problema es la
  // clave en sí y no su formato: se corta acá con un mensaje que apunta al
  // sitio correcto, en vez de dejar que OpenSSL responda su
  // "DECODER routines::unsupported", que no le sirve a nadie.
  if (!/^-----BEGIN [A-Z ]+-----\n[\s\S]+\n-----END [A-Z ]+-----\n$/.test(privateKey)) {
    throw new Error(
      'FIREBASE_PRIVATE_KEY no tiene el formato de una clave PEM. Debe empezar por ' +
        '-----BEGIN PRIVATE KEY----- y terminar por -----END PRIVATE KEY-----. ' +
        'Cópiala del campo "private_key" del archivo JSON que descargaste de Firebase ' +
        '(Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada), ' +
        'sin las comillas que la rodean en el JSON.'
    );
  }

  return initializeApp({
    credential: cert({
      projectId: limpiar(FIREBASE_PROJECT_ID),
      clientEmail: limpiar(FIREBASE_CLIENT_EMAIL),
      privateKey,
    }),
    // Sin gs:// por delante: el SDK espera solo el nombre del bucket.
    storageBucket: limpiar(FIREBASE_STORAGE_BUCKET).replace(/^gs:\/\//, ''),
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
