import { IInvoiceRepository } from '../../domain/repositories/IInvoiceRepository';
import { InvoiceDIAN } from '../../domain/models/Invoice';

export class InMemoryInvoiceRepository implements IInvoiceRepository {
  private invoices: InvoiceDIAN[] = [];

  async findAll(): Promise<InvoiceDIAN[]> {
    return this.invoices.sort((a, b) => b.issueDate.getTime() - a.issueDate.getTime());
  }

  async findById(id: string): Promise<InvoiceDIAN | null> {
    return this.invoices.find(i => i.id === id) || null;
  }

  async create(invoiceData: Omit<InvoiceDIAN, 'id'>): Promise<InvoiceDIAN> {
    const newInvoice: InvoiceDIAN = {
      ...invoiceData,
      id: Date.now().toString(),
    };
    this.invoices.push(newInvoice);
    return newInvoice;
  }
}
