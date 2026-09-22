import { IOrderRepository } from '../../domain/repositories/IOrderRepository';
import { BillingService } from '../services/BillingService';
import { FinancialRecordService } from '../services/FinancialRecordService';
import { ClientDIAN } from '../../domain/models/Client';
import { InvoiceDIAN } from '../../domain/models/Invoice';

/**
 * Use Case: EmitPosterioriInvoiceUseCase
 * 
 * Propósito: Permite generar una factura electrónica a la DIAN de manera asíncrona para una 
 * orden POS que ya fue pagada y finalizada (estado DELIVERED), manteniendo la consistencia
 * contable mediante la anulación del registro financiero original.
 */
export class EmitPosterioriInvoiceUseCase {
  constructor(
    private orderRepository: IOrderRepository,
    private billingService: BillingService,
    private financialRecordService: FinancialRecordService
  ) {}

  /**
   * Ejecuta el caso de uso.
   * @param orderId ID de la orden.
   * @param restaurantId ID del restaurante.
   * @param clientData Datos tributarios del cliente (ClientDIAN).
   * @param boxId ID de la caja desde donde se hace la petición (opcional).
   * @returns Retorna un mensaje indicando que el proceso comenzó asincrónicamente.
   */
  async execute(orderId: string, restaurantId: string, clientData: ClientDIAN, boxId?: string): Promise<{ message: string, status: string }> {
    // 1. Validar tempranamente que la orden exista y pertenezca al restaurante
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new Error("La orden no existe.");
    }
    if (order.restaurantId !== restaurantId) {
      throw new Error("No tiene permisos sobre esta orden.");
    }

    // 2. Validar que la orden esté en estado completada/entregada
    if (order.status !== 'DELIVERED') {
      throw new Error("La orden debe estar en estado completada (DELIVERED) para emitir factura electrónica a posteriori.");
    }

    // 3. (Opcional pero recomendado) Validar que la orden no haya sido facturada ya.
    // Esto se podría hacer consultando InvoiceRepository, pero por ahora delegamos
    // la responsabilidad o asumimos que el frontend/controlador lo filtra.

    // 3.5. Validar, de forma síncrona y ANTES de encolar nada, que el
    // restaurante tenga la facturación electrónica activada desde el panel
    // supremo. Así el cajero recibe un error inmediato en vez de que el
    // proceso asíncrono falle en silencio más adelante.
    await this.billingService.assertEInvoiceEnabled(restaurantId);

    // 4. Iniciar el proceso de forma reactiva/asíncrona para no bloquear el Frontend.
    // Usamos setTimeout o promesa sin await para enviar al background.
    this.processInvoiceAsync(order, clientData, boxId).catch(err => {
      console.error(`[PosterioriInvoice] Error fatal asíncrono para la orden ${orderId}:`, err);
    });

    // 5. Devolver respuesta INMEDIATA (Status PROCESSING)
    return {
      message: "La solicitud de facturación electrónica ha sido encolada y se procesará en breve.",
      status: "PROCESSING"
    };
  }

  /**
   * Lógica interna de procesamiento en segundo plano.
   */
  private async processInvoiceAsync(order: any, clientData: ClientDIAN, boxId?: string): Promise<void> {
    console.log(`[PosterioriInvoice] Iniciando generación de FE para orden ${order.id}...`);

    try {
      // 1. Generar la factura (esto ya se comunica con la DIAN)
      // Se asume que BillingService guarda la factura internamente y la envía.
      const invoice = await this.billingService.generateInvoice(order, clientData);

      console.log(`[PosterioriInvoice] Factura generada con éxito (ID: ${invoice.id})`);

      // 2. Consistencia Contable:
      // Anular el ingreso original del POS (Venta PDV) 
      await this.financialRecordService.annulPOSTicket(order.id, order.totalAmount, order.restaurantId, boxId);
      
      // Crear un nuevo ingreso categorizado como Factura Electrónica
      await this.financialRecordService.createRecord({
        restaurantId: order.restaurantId,
        type: 'INCOME',
        amount: order.totalAmount,
        category: 'Venta con Factura Electrónica',
        paymentMethod: order.paymentMethod,
        boxId: boxId,
        boxName: 'Caja Facturación',
        date: new Date().toISOString(),
        description: `Cobro de Factura Electrónica #${invoice.invoiceNumber} (Reemplaza Orden #${order.orderNumber})`
      });

      console.log(`[PosterioriInvoice] Consistencia contable aplicada correctamente para orden ${order.id}`);
      
    } catch (error) {
      console.error(`[PosterioriInvoice] Fallo al procesar la factura de la orden ${order.id}:`, error);
      // En un entorno de producción avanzado, aquí se lanzaría una notificación web-push
      // o un webhook al frontend para indicar que hubo un error asíncrono con la DIAN.
    }
  }
}
