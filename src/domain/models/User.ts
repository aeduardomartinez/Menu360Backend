export type UserRole = 'SUPERADMIN' | 'ADMIN' | 'CASHIER' | 'DELIVERY' | 'WAITRESS' | 'KITCHEN';

export interface User {
  id: string;
  /** Nulo solo para el SUPERADMIN, que está por encima de los restaurantes.
   *  El resto de roles siempre pertenece a uno. */
  restaurantId: string | null;
  name?: string;
  lastName?: string;
  email: string;
  phone?: string;
  vehiclePlate?: string;
  passwordHash: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}
