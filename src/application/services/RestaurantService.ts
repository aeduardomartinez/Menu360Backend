import { randomUUID } from 'crypto';
import { IRestaurantRepository } from '../../domain/repositories/IRestaurantRepository';
import { Restaurant } from '../../domain/models/Restaurant';
import { PaymentAccount } from '../../domain/models/PaymentAccount';
import { IImageStorage } from '../../domain/services/IImageStorage';

// Límite defensivo: un restaurante real no necesita decenas de cuentas de
// transferencia, y sin un tope un body manipulado podría inflar el Json
// indefinidamente en cada guardado de configuración.
const MAX_PAYMENT_ACCOUNTS = 10;

// El logo del banco ya no viaja como base64 dentro del Json del restaurante:
// se sube a Firebase Storage (POST /api/uploads con folder=bancos) y acá solo
// se guarda su URL. El tope de longitud sigue existiendo como red de
// seguridad contra un payload manipulado, pero ahora acota una URL, no una
// imagen: 512 caracteres sobran para cualquier URL de descarga de Firebase.
const MAX_LOGO_URL_LENGTH = 512;

/**
 * Acepta únicamente URLs de descarga de Firebase Storage.
 *
 * Es deliberadamente estricto. Este valor acaba en un atributo `src` de la
 * pantalla de pago del cliente, así que dejar pasar una URL arbitraria
 * convertiría el panel de administración en una forma de hacer que el
 * navegador del cliente pida recursos a un servidor de terceros.
 */
function esUrlDeStorage(valor: string): boolean {
  if (valor.length > MAX_LOGO_URL_LENGTH) return false;
  try {
    const u = new URL(valor);
    return u.protocol === 'https:' && u.hostname === 'firebasestorage.googleapis.com';
  } catch {
    return false;
  }
}

export class RestaurantService {
  constructor(
    private restaurantRepository: IRestaurantRepository,
    // Opcional: sin él, cambiar el logo simplemente deja el anterior en
    // Storage en vez de borrarlo. Así el servicio se puede construir y probar
    // sin credenciales de Firebase.
    private imageStorage?: IImageStorage
  ) {}

  async getRestaurantBySlug(slug: string): Promise<Restaurant | null> {
    return this.restaurantRepository.findBySlug(slug);
  }

  async getRestaurantById(id: string): Promise<Restaurant | null> {
    return this.restaurantRepository.findById(id);
  }

  async updateRestaurant(id: string, data: Partial<Restaurant>): Promise<Restaurant> {
    const restaurant = await this.restaurantRepository.findById(id);
    if (!restaurant) throw new Error('Restaurant not found');

    const sanitizedData = { ...data };
    if (data.paymentAccounts !== undefined) {
      sanitizedData.paymentAccounts = this.normalizePaymentAccounts(data.paymentAccounts);
    }
    if (data.whatsappPhone !== undefined) {
      sanitizedData.whatsappPhone = this.normalizeWhatsappPhone(data.whatsappPhone);
    }

    const updated = { ...restaurant, ...sanitizedData };
    const guardado = await this.restaurantRepository.update(updated);

    // Limpieza de las imágenes que quedaron sin usar. Va después del guardado
    // y nunca antes: si se borrara primero y el guardado fallara, el
    // restaurante se quedaría apuntando a una imagen que ya no existe.
    //
    // Se comparan los tres campos de imagen que tiene un restaurante: logo,
    // portada y los logos de las cuentas de pago. De estas últimas hay que
    // mirar las que desaparecieron de la lista, no solo las que cambiaron,
    // porque borrar una cuenta entera también deja su logo huérfano.
    if (this.imageStorage) {
      const viejas = this.imagenesDe(restaurant);
      const nuevas = new Set(this.imagenesDe(guardado));
      const sobrantes = viejas.filter((url) => !nuevas.has(url));
      await Promise.all(sobrantes.map((url) => this.imageStorage!.deleteByUrl(url)));
    }

    return guardado;
  }

  /** Todas las URLs de imagen que un restaurante tiene apuntadas ahora mismo. */
  private imagenesDe(r: Restaurant): string[] {
    const cuentas: PaymentAccount[] = Array.isArray(r.paymentAccounts) ? r.paymentAccounts : [];
    return [r.logoUrl, r.heroImageUrl, ...cuentas.map((c) => c?.logoUrl)].filter(
      (u): u is string => typeof u === 'string' && u.length > 0
    );
  }

  /// El número de WhatsApp se guarda listo para armar el enlace wa.me que usa
  /// la página de seguimiento del cliente: solo dígitos y con indicativo de
  /// país. Si llegan los 10 dígitos de un celular colombiano se completa el 57,
  /// que es lo que se escribe naturalmente en el panel. Guardarlo sin
  /// normalizar dejaba enlaces rotos (WhatsApp abierto sin destinatario) según
  /// cómo lo hubiera escrito cada quien.
  private normalizeWhatsappPhone(value?: string | null): string {
    const digits = (value || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`;
    return digits;
  }

  /// Descarta cuentas incompletas (sin banco, número o titular), recorta
  /// espacios en blanco y garantiza que cada cuenta tenga un id estable, para
  /// que lo que llega del panel administrativo nunca deje datos a medio
  /// llenar en la pantalla de pago del cliente.
  private normalizePaymentAccounts(accounts: PaymentAccount[] | null | undefined): PaymentAccount[] {
    if (!Array.isArray(accounts)) return [];

    return accounts
      .map((account) => {
        const logo = typeof account?.logoUrl === 'string' ? account.logoUrl.trim() : '';
        const isValidLogo = esUrlDeStorage(logo);

        return {
          id: account?.id || randomUUID(),
          bankName: (account?.bankName || '').trim(),
          accountType: (account?.accountType || '').trim(),
          accountNumber: (account?.accountNumber || '').trim(),
          accountHolder: (account?.accountHolder || '').trim(),
          isActive: account?.isActive !== false,
          ...(isValidLogo ? { logoUrl: logo } : {}),
        };
      })
      .filter((account) => account.bankName && account.accountNumber && account.accountHolder)
      .slice(0, MAX_PAYMENT_ACCOUNTS);
  }
}
