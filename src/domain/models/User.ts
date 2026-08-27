export type UserRole = 'SUPERADMIN' | 'ADMIN' | 'CASHIER' | 'DELIVERY' | 'WAITRESS' | 'KITCHEN';

export interface User {
  id: string;
  restaurantId: string;
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
