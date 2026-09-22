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
  clientDocument?: string;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  paymentMethod: 'transfer' | 'CASH' | 'CARD' | string;
  isPaid: boolean;
  driverConfirmedCash: boolean;
  // Domicilios web por transferencia: el cajero ya verificó con su banco que
  // el dinero llegó, pero el pedido todavía no se factura (ver schema.prisma).
  transferConfirmed?: boolean;
  // Pedidos de la web: cuándo el restaurante los aceptó. Aceptar no cambia el
  // estado del pedido (sigue "Pendiente" hasta que lo pasen a preparación a
  // mano), solo deja de pedir que se acepte o rechace.
  acceptedAt?: Date;
  deliveryAddress?: string;
  deliveryType?: DeliveryType;    // DELIVERY | PICKUP | DINE_IN
  neighborhood?: string;          // Barrio
  city?: string;                  // Ciudad
  orderComments?: string;         // Comentarios del pedido
  orderNumber?: number;
  origin?: 'WEB' | 'POS';
  driverId?: string;
  tableId?: string;
  tableName?: string;
  waitressId?: string;
  waitressName?: string;
  hasInvoice?: boolean;
  createdAt: Date;
  updatedAt: Date;
}
