import { FinancialRecord } from '../../domain/models/FinancialRecord';
import { PrismaFinancialRecordRepository } from '../../infrastructure/repositories/PrismaFinancialRecordRepository';
import { randomUUID } from 'crypto';

export class FinancialRecordService {
  constructor(private repository: PrismaFinancialRecordRepository) {}

  async createRecord(recordData: Omit<FinancialRecord, 'id' | 'createdAt'>): Promise<FinancialRecord> {
    const newRecord: FinancialRecord = {
      ...recordData,
      id: randomUUID(),
      createdAt: new Date().toISOString()
    };
    return this.repository.create(newRecord);
  }

  async getRecordsByRestaurant(restaurantId: string): Promise<FinancialRecord[]> {
    return this.repository.findByRestaurant(restaurantId);
  }
}
