import { Product } from "./Product";

export type OrderStatus = 'PENDING' | 'PREPARING' | 'READY' | 'SENT' | 'ARRIVED' | 'DELIVERED' | 'CANCELLED';
export type DeliveryType = 'DELIVERY' | 'PICKUP' | 'DINE_IN';

export interface OrderItem {
  cartItemId?: string;
  product: Product;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  specialInstructions?: string;
  selectedVariant?: any;
  selectedModifiers?: any[];
}

export interface Order {
  id: string;
  restaurantId: string;
  clientName: string;
  clientPhone: string;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  paymentMethod: 'NEQUI' | 'BANCOLOMBIA' | 'CASH' | 'CARD';
  deliveryAddress: string;
  deliveryType?: DeliveryType;    // DELIVERY | PICKUP | DINE_IN
  neighborhood?: string;          // Barrio
  city?: string;                  // Ciudad
  orderComments?: string;         // Comentarios del pedido
  orderNumber?: number;
  orderType?: 'DELIVERY' | 'POS';
  origin?: 'WEB' | 'POS';
  driverId?: string;
  createdAt: Date;
  updatedAt: Date;
}
