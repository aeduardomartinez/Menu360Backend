import { FinancialRecord } from '../../domain/models/FinancialRecord';
import { prisma } from '../db/prisma';

export class PrismaFinancialRecordRepository {
  async create(record: FinancialRecord): Promise<FinancialRecord> {
    const newRecord = await prisma.financialRecord.create({
      data: {
        id: record.id,
        restaurantId: record.restaurantId,
        type: record.type,
        amount: record.amount,
        category: record.category,
        date: new Date(record.date),
        boxName: record.boxName,
        boxId: record.boxId,
        paymentMethod: record.paymentMethod,
        description: record.description,
        createdAt: new Date(record.createdAt)
      }
    });
    return this.mapToRecord(newRecord);
  }

  async findByRestaurant(restaurantId: string): Promise<FinancialRecord[]> {
    const records = await prisma.financialRecord.findMany({
      where: { restaurantId },
      orderBy: { date: 'desc' }
    });
    return records.map(this.mapToRecord);
  }

  private mapToRecord(data: any): FinancialRecord {
    return {
      id: data.id,
      restaurantId: data.restaurantId,
      type: data.type as any,
      amount: data.amount,
      category: data.category,
      date: data.date.toISOString(),
      boxName: data.boxName || '',
      boxId: data.boxId || undefined,
      paymentMethod: data.paymentMethod || undefined,
      description: data.description || undefined,
      createdAt: data.createdAt.toISOString()
    };
  }
}
