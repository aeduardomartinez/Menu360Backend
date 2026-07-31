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
  imageUrl: string; // Firebase URL
  isAvailable: boolean; // For real-time out of stock toggle
  trackStock?: boolean;
  currentStock?: number | null;

  isFeatured?: boolean;
  variants?: ProductVariant[];
  modifierIds?: string[];
  createdAt: Date;
  updatedAt: Date;
}
