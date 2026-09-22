export interface ProductVariant {
  id: string;
  name: string;
  price: number;
  isAvailable?: boolean;
}

export interface Product {
  id: string;
  restaurantId: string;
  name: string;
  description: string;
  price: number;
  category: string;
  /** URL de la imagen en Firebase Storage (tamaño completo, para el detalle). */
  imageUrl: string;
  /** Miniatura de 400px para las tarjetas de la carta y del POS. */
  thumbnailUrl?: string | null;
  isAvailable: boolean; // For real-time out of stock toggle
  trackStock?: boolean;
  currentStock?: number | null;

  isFeatured?: boolean;
  variants?: ProductVariant[];
  modifierIds?: string[];
  createdAt: Date;
  updatedAt: Date;
}
