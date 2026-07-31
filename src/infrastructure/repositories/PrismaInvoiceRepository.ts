import { IInvoiceRepository } from '../../domain/repositories/IInvoiceRepository';
import { InvoiceDIAN } from '../../domain/models/Invoice';
import { prisma } from '../db/prisma';

export class PrismaInvoiceRepository implements IInvoiceRepository {
  async findAll(restaurantId?: string): Promise<InvoiceDIAN[]> {
    const invoices = await prisma.invoice.findMany({
      where: restaurantId ? { restaurantId } : undefined,
      orderBy: { issuedAt: 'desc' }
    });
    return invoices.map(this.mapToInvoiceDIAN);
  }

  async findById(id: string): Promise<InvoiceDIAN | null> {
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    return invoice ? this.mapToInvoiceDIAN(invoice) : null;
  }

  async create(invoiceData: Omit<InvoiceDIAN, 'id'>): Promise<InvoiceDIAN> {
    const newInvoice = await prisma.invoice.create({
      data: {
        restaurantId: 'rest-1', // Default for now
        orderId: invoiceData.orderId,
        clientName: invoiceData.client.businessName,
        clientNit: invoiceData.client.documentNumber,
        clientEmail: invoiceData.client.email || '',
        clientPhone: invoiceData.client.phone,
        totalAmount: invoiceData.totalAmount,
        status: invoiceData.status,
        issuedAt: new Date(invoiceData.issueDate)
      }
    });
    return this.mapToInvoiceDIAN(newInvoice);
  }

  private mapToInvoiceDIAN(data: any): InvoiceDIAN {
    return {
      id: data.id,
      invoiceNumber: data.id.substring(0, 8),
      orderId: data.orderId,
      client: {
        id: data.id,
        businessName: data.clientName,
        documentNumber: data.clientNit,
        documentType: 'CC',
        email: data.clientEmail,
        phone: data.clientPhone || '',
        address: '',
        fiscalRegime: 'ORDINARY'
      },
      subtotal: data.totalAmount,
      totalTaxes: 0,
      totalAmount: data.totalAmount,
      taxes: [],
      issueDate: data.issuedAt,
      status: data.status as any
    };
  }
}
