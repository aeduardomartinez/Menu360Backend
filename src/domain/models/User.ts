export type UserRole = 'ADMIN' | 'CASHIER' | 'DELIVERY';

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
