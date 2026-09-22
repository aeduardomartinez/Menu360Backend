import sharp from 'sharp';

/**
 * Normaliza las imágenes que suben los restaurantes antes de guardarlas.
 *
 * Vive separado de FirebaseStorageService a propósito: acá no se habla con
 * ningún servicio externo, así que se puede probar con un archivo real sin
 * credenciales ni red. Lo que sube a Storage es siempre el resultado de este
 * módulo, nunca el archivo tal como llegó del navegador.
 *
 * Tres cosas pasan acá, y las tres importan:
 *
 *  1. Se convierte todo a WebP. Pesa entre un 25% y un 35% menos que un JPEG
 *     de calidad equivalente, y en Firebase lo que se paga caro no es guardar
 *     (unos 0,026 USD por GB al mes) sino la descarga (unos 0,12 USD por GB).
 *     Cada byte que se ahorra acá se ahorra en cada visita de cada cliente.
 *
 *  2. Se borran los metadatos. Una foto sacada con el celular lleva dentro la
 *     marca del teléfono, la hora exacta y, muy a menudo, las coordenadas GPS
 *     de dónde se tomó. Eso acabaría en una URL pública que cualquiera puede
 *     descargar. sharp descarta los metadatos salvo que se le pida lo
 *     contrario, pero el .rotate() sin argumentos va antes justamente para
 *     aplicar la orientación EXIF mientras todavía existe: sin él, las fotos
 *     verticales de iPhone salen acostadas.
 *
 *  3. De los platos se genera además una miniatura. La carta muestra las
 *     tarjetas a unos 300px de ancho; mandar ahí la imagen de 1000px era
 *     pagar por descargar diez veces más píxeles de los que se ven.
 */

export type ImageFolder = 'productos' | 'logos' | 'portadas' | 'bancos';

interface Perfil {
  ancho: number;
  alto: number;
  /** Calidad WebP (0-100). 76 es el punto donde deja de notarse la pérdida. */
  calidad: number;
  /** Ancho de la miniatura, si esta clase de imagen la necesita. */
  miniatura?: number;
  /** Conserva el canal alfa. Los logos suelen venir en PNG transparente. */
  transparencia?: boolean;
}

const PERFILES: Record<ImageFolder, Perfil> = {
  // El detalle del plato usa la grande; la carta, la miniatura.
  productos: { ancho: 1000, alto: 1000, calidad: 76, miniatura: 400 },
  portadas: { ancho: 1600, alto: 900, calidad: 76 },
  logos: { ancho: 400, alto: 400, calidad: 82, transparencia: true },
  bancos: { ancho: 160, alto: 160, calidad: 82, transparencia: true },
};

export const CARPETAS = Object.keys(PERFILES) as ImageFolder[];

export function esCarpetaValida(v: unknown): v is ImageFolder {
  return typeof v === 'string' && (CARPETAS as string[]).includes(v);
}

export interface ImagenProcesada {
  original: Buffer;
  miniatura: Buffer | null;
  contentType: 'image/webp';
  extension: 'webp';
}

/**
 * Convierte el archivo recibido en uno o dos WebP listos para subir.
 *
 * Lanza si el buffer no es una imagen que sharp pueda decodificar. Eso es la
 * validación de verdad: comprobar el mimetype que declara el navegador no
 * sirve de nada porque lo escribe quien hace la petición, y mirar los
 * primeros bytes se engaña pegando una cabecera válida delante de cualquier
 * cosa. Si sharp logra decodificarla y volverla a codificar, es una imagen.
 */
export async function procesarImagen(buffer: Buffer, folder: ImageFolder): Promise<ImagenProcesada> {
  const perfil = PERFILES[folder];

  const base = () =>
    sharp(buffer, { failOn: 'error' })
      // Antes de nada: aplicar la orientación que venga en el EXIF, porque un
      // paso más abajo el EXIF ya no existe.
      .rotate()
      .resize({
        width: perfil.ancho,
        height: perfil.alto,
        fit: 'inside',
        // Una foto pequeña no se agranda: solo añadiría peso sin detalle.
        withoutEnlargement: true,
      });

  const opcionesWebp = {
    quality: perfil.calidad,
    // effort 4 de 6: comprime casi como el máximo tardando bastante menos.
    // El dueño del restaurante está esperando a que cargue su plato.
    effort: 4,
    alphaQuality: perfil.transparencia ? 100 : 0,
  };

  const original = await base().webp(opcionesWebp).toBuffer();

  const miniatura = perfil.miniatura
    ? await base()
        .resize({ width: perfil.miniatura, withoutEnlargement: true })
        .webp({ ...opcionesWebp, quality: 70 })
        .toBuffer()
    : null;

  return { original, miniatura, contentType: 'image/webp', extension: 'webp' };
}
