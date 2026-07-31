import { IInvoiceRepository } from '../../domain/repositories/IInvoiceRepository';
import { InvoiceDIAN } from '../../domain/models/Invoice';
import { Order } from '../../domain/models/Order';
import { ClientDIAN } from '../../domain/models/Client';

export class BillingService {
  constructor(private invoiceRepository: IInvoiceRepository) {}

  async generateInvoice(order: Order, client: ClientDIAN): Promise<InvoiceDIAN> {
    const TAX_PERCENTAGE = 0.08; // 8% Impoconsumo como ejemplo

    // Calculate taxes
    const taxableAmount = order.totalAmount / (1 + TAX_PERCENTAGE);
    const taxAmount = order.totalAmount - taxableAmount;

    const invoiceData: Omit<InvoiceDIAN, 'id'> = {
      invoiceNumber: `RESOLUCION-${Date.now()}`, // En un entorno real se genera con prefijo y número autorizado por la DIAN
      orderId: order.id,
      client,
      subtotal: taxableAmount,
      totalTaxes: taxAmount,
      totalAmount: order.totalAmount,
      taxes: [
        {
          taxType: 'IMPOCONSUMO',
          taxPercentage: TAX_PERCENTAGE,
          taxAmount,
          taxableAmount,
        }
      ],
      issueDate: new Date(),
      status: 'DRAFT',
    };

    return this.invoiceRepository.create(invoiceData);
  }

  async getInvoiceById(id: string): Promise<InvoiceDIAN | null> {
    return this.invoiceRepository.findById(id);
  }

  async getAllInvoices(restaurantId?: string): Promise<InvoiceDIAN[]> {
    return this.invoiceRepository.findAll(restaurantId);
  }
}
