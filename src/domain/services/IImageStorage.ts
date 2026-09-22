/**
 * Contrato de almacenamiento de imágenes.
 *
 * Existe para que la capa de aplicación (MenuService, RestaurantService)
 * pueda pedir que se borre una imagen sin depender de Firebase. Hoy lo
 * implementa FirebaseStorageService; si mañana se cambia de proveedor, los
 * servicios de aplicación no se enteran.
 *
 * Solo declara el borrado a propósito. La subida entra por su propio endpoint
 * (POST /api/uploads) y nunca pasa por estos servicios: cuando MenuService
 * recibe un producto, la imagen ya está en Storage y lo que le llega es una
 * URL.
 */
export interface IImageStorage {
  /**
   * Borra la imagen de esa URL y su miniatura, si existen.
   *
   * No lanza: un borrado fallido no debe tumbar la operación que le importa
   * al usuario. Como mucho deja una imagen sin usar ocupando espacio, que es
   * un problema de centavos y no de funcionamiento.
   */
  deleteByUrl(url: string | null | undefined): Promise<void>;
}
