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

  // Verifica que el restaurante tenga la facturación electrónica activada
  // desde el panel supremo (SuperAdmin). Ya no depende del plan
  // (BASIC/ADVANCED): es un interruptor independiente por tienda, apagado
  // por defecto, que solo el SUPERADMIN puede encender. Se usa tanto aquí
  // como en el caso de uso de facturación a posteriori, para bloquear la
  // generación de la factura en el servidor sin importar qué mande el
  // frontend.
  async assertEInvoiceEnabled(restaurantId: string) {
    const restaurant = await this.restaurantRepository.findById(restaurantId);
    if (!restaurant?.eInvoiceEnabled) {
      throw new Error('EINVOICE_DISABLED|La facturación electrónica no está activada para este restaurante. Un SUPERADMIN debe activarla desde el panel supremo.');
    }
    return restaurant;
  }

  // Método orquestador que crea el registro interno de la factura y la despacha a la DIAN.
  // Este método es llamado asincrónicamente por el OrderController al finalizar una orden.
  async generateInvoice(order: Order, client: ClientDIAN): Promise<InvoiceDIAN> {
    // 1. Consultar la configuración tributaria del restaurante (y bloquear
    // si la facturación electrónica no está activada para esta tienda)
    const restaurant = await this.assertEInvoiceEnabled(order.restaurantId);
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
      invoiceNumber: `RESOLUCION-${Date.now()}`, // Provisional: si el proveedor devuelve el número autorizado, se reemplaza más abajo
      restaurantId: order.restaurantId,
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

      // Mientras no haya proveedor configurado (DIAN_API_URL vacío) la
      // respuesta es simulada, así que la factura queda solo "emitida": decir
      // que fue reportada a la DIAN cuando no se envió a ningún lado dejaría
      // el estado mintiendo en la base de datos.
      invoiceData.status = dianResponse.simulated ? 'ISSUED' : 'REPORTED_DIAN';

      // Datos que devuelve el proveedor y que necesitamos guardar: el CUFE es
      // lo que valida la factura ante la DIAN y lo que alimenta el QR del
      // recibo, y la URL es la copia pública de la factura.
      if (dianResponse.invoiceNumber) invoiceData.invoiceNumber = dianResponse.invoiceNumber;
      if (dianResponse.cufe) invoiceData.cufe = dianResponse.cufe;
      if (dianResponse.dianUrl) invoiceData.dianUrl = dianResponse.dianUrl;
    } catch (error: any) {
      console.error('Fallo al enviar factura a DIAN:', error?.message || error);
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
