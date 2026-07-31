import { InvoiceDIAN } from '../models/Invoice';

export interface IInvoiceRepository {
  findAll(restaurantId?: string): Promise<InvoiceDIAN[]>;
  findById(id: string): Promise<InvoiceDIAN | null>;
  create(invoice: Omit<InvoiceDIAN, 'id'>): Promise<InvoiceDIAN>;
}
