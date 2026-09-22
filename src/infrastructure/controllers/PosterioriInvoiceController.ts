import { Request, Response } from 'express';
import { EmitPosterioriInvoiceUseCase } from '../../application/use-cases/EmitPosterioriInvoiceUseCase';

export class PosterioriInvoiceController {
  constructor(private emitPosterioriInvoiceUseCase: EmitPosterioriInvoiceUseCase) {}

  /**
   * Endpoint para emitir factura electrónica de una orden POS ya pagada.
   * HTTP: POST /api/orders/:id/electronic-invoice
   */
  emit = async (req: Request, res: Response) => {
    try {
      const orderId = req.params.id;
      const restaurantId = req.user!.restaurantId;
      const { clientData, boxId } = req.body;

      if (!clientData || !clientData.identificacion) {
        return res.status(400).json({ error: "Faltan los datos tributarios del cliente (clientData)." });
      }

      // Ejecutar el caso de uso que maneja la asincronía
      const result = await this.emitPosterioriInvoiceUseCase.execute(
        orderId, 
        restaurantId, 
        clientData, 
        boxId
      );

      // Responder inmediatamente con status 202 (Accepted) o 200 indicando proceso en background
      res.status(202).json(result);
    } catch (error: any) {
      console.error("[PosterioriInvoiceController] Error:", error.message);
      if (typeof error?.message === 'string' && error.message.startsWith('EINVOICE_DISABLED|')) {
        return res.status(403).json({ error: error.message.split('|').slice(1).join('|') });
      }
      if (error.message.includes('No tiene permisos') || error.message.includes('no existe')) {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('completada')) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  };
}
