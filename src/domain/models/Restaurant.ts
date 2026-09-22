export interface Restaurant {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  themeColor: string; // e.g. '#FF5733'
  adminThemeColor?: string; // Color for the admin panel
  welcomeMessage?: string;
  description?: string;
  address?: string;
  neighborhood?: string;
  city?: string;
  heroImageUrl?: string;
  fontFamily?: string;
  borderRadius?: string;
  isDarkMode?: boolean;
  categoryNavStyle?: string;
  heroStyle?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  tiktokUrl?: string;
  whatsappPhone?: string; // WhatsApp number for order confirmations (e.g. 573001234567)
  couponsEnabled?: boolean;
  deliveryConfig?: any;
  estimatedDeliveryTime?: string;
  minimumOrderAmount?: number;
  schedule?: any;
  titleEffect?: string;
  iconColor?: string;
  iconStyle?: string;
  // Apariencia del menú del cliente (ver schema.prisma para el detalle de
  // cada uno y de por qué buttonStyle no se estaba guardando).
  accentColor?: string;
  buttonStyle?: string;
  productCardStyle?: string;
  cardShadow?: string;
  sectionTitleStyle?: string;
  pageBackground?: string;
  headingFont?: string;
  itemLayout?: string;
  priceStyle?: string;
  nameStyle?: string;
  density?: string;
  imageShape?: string;
  planType?: string;
  taxType?: string | null;
  taxRate?: number | null;
  acceptedPaymentMethods?: string[];
  // Tipado como `any` (igual que deliveryConfig/schedule) porque Prisma
  // representa este campo Json como `JsonValue`, que no castea limpio contra
  // una interfaz estricta. La forma real (ver PaymentAccount en
  // ./PaymentAccount.ts) se valida y se tipa fuerte en el punto donde
  // realmente importa: RestaurantService.normalizePaymentAccounts.
  paymentAccounts?: any;
  // Controlado solo por el SUPERADMIN desde el panel supremo (ver
  // SuperAdminController.updateRestaurantEInvoice); no se expone en el
  // whitelist de PrismaRestaurantRepository.update() para que el propio
  // restaurante no pueda activárselo a sí mismo desde su configuración.
  eInvoiceEnabled?: boolean | null;
}
