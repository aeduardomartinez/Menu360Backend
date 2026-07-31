export interface ModifierOption {
  id: string;
  name: string;
  extraPrice: number;
  discountPrice?: number;
  cost?: number;
  sku?: string;
  showDiscount?: boolean;
  showCost?: boolean;
  showSku?: boolean;
}

export interface ModifierCategory {
  id: string;
  restaurantId: string;
  name: string;
  isRequired: boolean;
  selectionType: 'single' | 'multiple';
  options: ModifierOption[];
  associatedProductIds: string[];
  createdAt: Date;
  updatedAt: Date;
}
