export interface FinancialRecord {
  id: string;
  restaurantId: string;
  type: 'INCOME' | 'EXPENSE';
  amount: number;
  category: string;
  date: string;
  boxName: string;
  boxId?: string;
  createdAt: string;
  paymentMethod?: string;
  description?: string;
}
