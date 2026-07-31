import { FinancialRecord } from '../../domain/models/FinancialRecord';

export class InMemoryFinancialRecordRepository {
  private records: FinancialRecord[] = [];

  async create(record: FinancialRecord): Promise<FinancialRecord> {
    this.records.push(record);
    return record;
  }

  async findByRestaurant(restaurantId: string): Promise<FinancialRecord[]> {
    // Return ordered by date descending
    return this.records
      .filter(r => r.restaurantId === restaurantId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }
}
