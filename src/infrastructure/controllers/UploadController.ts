import { Request, Response } from 'express';
import { firebaseStorage } from '../services/FirebaseStorageService';
import { esCarpetaValida, CARPETAS } from '../services/ImageProcessor';

/**
 * Subida de imágenes del menú a Firebase Storage.
 *
 * Un solo endpoint para las cuatro clases de imagen (platos, logos, portadas
 * y logos de banco): lo único que cambia entre ellas es el tamaño al que se
 * normalizan, y eso lo decide ImageProcessor según la carpeta.
 */
export class UploadController {
  /** POST /api/uploads — multipart con los campos `file` y `folder`. */
  uploadImage = async (req: Request, res: Response) => {
    try {
      const file = (req as any).file as { buffer: Buffer; size: number } | undefined;
      if (!file?.buffer?.length) {
        return res.status(400).json({ error: 'No se recibió ninguna imagen.' });
      }

      // El restaurante sale del token y nunca del cuerpo de la petición. Si
      // viniera del body, un administrador podría escribir en la carpeta de
      // otro restaurante con solo cambiar un campo — es la misma regla que ya
      // se aplica al crear productos en api.ts.
      const restaurantId = req.user?.restaurantId;
      if (!restaurantId) {
        return res.status(401).json({ error: 'Sesión no válida.' });
      }

      const folder = req.body?.folder;
      if (!esCarpetaValida(folder)) {
        return res.status(400).json({ error: `La carpeta debe ser una de: ${CARPETAS.join(', ')}.` });
      }

      const resultado = await firebaseStorage.upload(file.buffer, restaurantId, folder);
      return res.status(201).json(resultado);
    } catch (e: any) {
      // sharp lanza cuando el archivo no es una imagen que pueda decodificar.
      // Eso es culpa de lo que mandaron, no del servidor, así que va como 400
      // y con un mensaje que el dueño del restaurante pueda entender.
      if (/unsupported image format|Input buffer|premature end|VipsJpeg|corrupt/i.test(String(e?.message))) {
        return res.status(400).json({ error: 'El archivo no es una imagen válida. Usa JPG, PNG o WebP.' });
      }
      console.error('[upload]', e);
      return res.status(500).json({ error: 'No se pudo subir la imagen. Intenta de nuevo.' });
    }
  };
}
