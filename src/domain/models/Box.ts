export type BoxStatus = 'OPEN' | 'CLOSED';

export interface Box {
  id: string;
  restaurantId: string;
  name: string;
  description: string;
  assignedUserId: string | null;
  status: BoxStatus;
  openedAt: string | null;
  closedAt: string | null;
  currentBalance: number;
  createdAt: string;
  updatedAt: string;
}
