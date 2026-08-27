import { IInvoiceRepository } from '../../domain/repositories/IInvoiceRepository';
import { IRestaurantRepository } from '../../domain/repositories/IRestaurantRepository';
import { InvoiceDIAN } from '../../domain/models/Invoice';
import { Order } from '../../domain/models/Order';
import { ClientDIAN } from '../../domain/models/Client';
import { DianIntegrationService } from '../../infrastructure/services/DianIntegrationService';

export class BillingService {
  constructor(
    private invoiceRepository: IInvoiceRepository,
    private restaurantRepository: IRestaurantRepository,
    private dianIntegrationService: DianIntegrationService
  ) {}

  // Método orquestador que crea el registro interno de la factura y la despacha a la DIAN.
  // Este método es llamado asincrónicamente por el OrderController al finalizar una orden.
  async generateInvoice(order: Order, client: ClientDIAN): Promise<InvoiceDIAN> {
    // 1. Consultar la configuración tributaria del restaurante
    const restaurant = await this.restaurantRepository.findById(order.restaurantId);
    const taxType = restaurant?.taxType && restaurant.taxType !== 'NONE' ? restaurant.taxType : null;
    const taxRate = restaurant?.taxRate || 0;
    
    // 2. Extraer matemáticamente el impuesto del total pagado (Asumiendo que el producto ya tiene IVA/INC incluido)
    // Si taxType es nulo o NONE, no desglosamos impuestos (o es 0)
    let taxableAmount = order.totalAmount;
    let taxAmount = 0;
    
    if (taxType && taxRate > 0) {
      taxableAmount = order.totalAmount / (1 + taxRate); // Subtotal (Base gravable)
      taxAmount = order.totalAmount - taxableAmount;     // Monto del impuesto
    }

    // 3. Crear el modelo de la factura para guardar en nuestra base de datos local
    const invoiceData: Omit<InvoiceDIAN, 'id'> = {
      invoiceNumber: `RESOLUCION-${Date.now()}`, // En un entorno real se genera con prefijo y número autorizado por la DIAN
      orderId: order.id,
      client,
      subtotal: taxableAmount,
      totalTaxes: taxAmount,
      totalAmount: order.totalAmount,
      taxes: taxType && taxRate > 0 ? [
        {
          taxType: taxType as 'IVA' | 'IMPOCONSUMO',
          taxPercentage: taxRate,
          taxAmount,
          taxableAmount,
        }
      ] : [],
      issueDate: new Date(),
      status: 'ISSUED', // Estado inicial mientras se envía a la DIAN
    };

    // 4. Llamar al servicio de integración con el proveedor de la DIAN
    try {
      // DianIntegrationService se encarga de convertir nuestra data al JSON que espera el proveedor
      const dianResponse = await this.dianIntegrationService.sendInvoice(order, client);
      console.log('Factura enviada a DIAN correctamente:', dianResponse.message);
      invoiceData.status = 'REPORTED_DIAN'; // Si responde OK, marcamos como reportada
    } catch (error) {
      console.error('Fallo al enviar factura a DIAN:', error);
      invoiceData.status = 'ERROR_DIAN';
    }

    return this.invoiceRepository.create(invoiceData);
  }

  async getInvoiceById(id: string): Promise<InvoiceDIAN | null> {
    return this.invoiceRepository.findById(id);
  }

  async getAllInvoices(restaurantId?: string): Promise<InvoiceDIAN[]> {
    return this.invoiceRepository.findAll(restaurantId);
  }

  async generateCreditNote(orderId: string): Promise<InvoiceDIAN | null> {
    const invoice = await this.invoiceRepository.findByOrderId(orderId);
    if (!invoice) return null; // No invoice, no credit note needed
    
    // Simulate DIAN Integration for Credit Note
    console.log(`Mock DIAN: Generando Nota de Crédito para la factura asociada a la orden ${orderId}`);
    
    // Update invoice status to CANCELLED to represent it was annulled via credit note
    return this.invoiceRepository.updateStatus(invoice.id, 'CANCELLED');
  }
}
