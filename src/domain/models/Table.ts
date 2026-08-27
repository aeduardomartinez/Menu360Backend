export interface Table {
  id: string;
  restaurantId: string;
  name: string;
  capacity?: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
