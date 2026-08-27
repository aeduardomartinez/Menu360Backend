export interface Restaurant {
  id: string;
  slug: string;
  name: string;
  logoBase64: string | null;
  themeColor: string; // e.g. '#FF5733'
  adminThemeColor?: string; // Color for the admin panel
  welcomeMessage?: string;
  description?: string;
  address?: string;
  neighborhood?: string;
  city?: string;
  heroImageBase64?: string;
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
  planType?: string;
  taxType?: string | null;
  taxRate?: number | null;
}
