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

  /**
   * Anula un tiquete POS original creando un movimiento de Egreso (EXPENSE) por el mismo valor.
   * Esto mantiene la consistencia contable al emitir una Factura Electrónica a posteriori.
   */
  async annulPOSTicket(orderId: string, amount: number, restaurantId: string, boxId?: string): Promise<FinancialRecord> {
    const annulmentRecord: Omit<FinancialRecord, 'id' | 'createdAt'> = {
      restaurantId,
      type: 'EXPENSE',
      amount,
      category: 'Anulación Tiquete POS por FE',
      date: new Date().toISOString(),
      boxName: 'Caja Facturación',
      boxId: boxId,
      paymentMethod: 'Interno',
      description: `Anulación contable interna del tiquete POS de la orden ${orderId} por emisión de Factura Electrónica.`
    };
    return this.createRecord(annulmentRecord);
  }
}
