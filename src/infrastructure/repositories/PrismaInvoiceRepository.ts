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

  async findByOrderId(orderId: string): Promise<InvoiceDIAN | null> {
    const invoice = await prisma.invoice.findFirst({ where: { orderId } });
    return invoice ? this.mapToInvoiceDIAN(invoice) : null;
  }

  async updateStatus(id: string, status: string): Promise<InvoiceDIAN> {
    const updated = await prisma.invoice.update({
      where: { id },
      data: { status }
    });
    return this.mapToInvoiceDIAN(updated);
  }

  async create(invoiceData: Omit<InvoiceDIAN, 'id'>): Promise<InvoiceDIAN> {
    const newInvoice = await prisma.invoice.create({
      data: {
        // Viene siempre del pedido que se está facturando. Antes estaba fijo
        // en 'rest-1', así que todas las facturas se guardaban a nombre del
        // mismo restaurante: en cualquier otra tienda quedaban mal atribuidas
        // y no aparecían al consultarlas por restaurante. No se deja ningún
        // valor por defecto a propósito — guardar la factura bajo otra tienda
        // en silencio sería peor que fallar.
        restaurantId: invoiceData.restaurantId,
        orderId: invoiceData.orderId,
        clientName: invoiceData.client.razonSocial,
        clientNit: invoiceData.client.identificacion,
        clientEmail: invoiceData.client.emailContacto || '',
        clientPhone: invoiceData.client.telefonoContacto,
        totalAmount: invoiceData.totalAmount,
        status: invoiceData.status,
        // Lo que respondió el proveedor (vacío mientras no haya uno configurado).
        cufe: invoiceData.cufe || null,
        dianUrl: invoiceData.dianUrl || null,
        issuedAt: new Date(invoiceData.issueDate)
      }
    });
    return this.mapToInvoiceDIAN(newInvoice);
  }

  private mapToInvoiceDIAN(data: any): InvoiceDIAN {
    return {
      id: data.id,
      invoiceNumber: data.id.substring(0, 8),
      restaurantId: data.restaurantId,
      cufe: data.cufe || undefined,
      dianUrl: data.dianUrl || undefined,
      orderId: data.orderId,
      client: {
        razonSocial: data.clientName,
        identificacion: data.clientNit,
        tipoId: 'CC',
        emailContacto: data.clientEmail,
        telefonoContacto: data.clientPhone || '',
        direccion: '',
        regimenFiscal: 'Responsable de IVA',
        departamento: '',
        municipio: '',
        dv: '0',
        responsabilidades: 'R-99-PN',
        nombreContacto: data.clientName
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
