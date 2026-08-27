import { Request, Response } from 'express';
import { OrderService } from '../../application/services/OrderService';
import { BillingService } from '../../application/services/BillingService';
import { ClientService } from '../../application/services/ClientService';
import { ClientDIAN } from '../../domain/models/Client';

export class OrderController {
  // Controller for managing orders
  constructor(
    private orderService: OrderService,
    private billingService: BillingService,
    private clientService: ClientService
  ) {}

  createOrder = async (req: Request, res: Response) => {
    try {
      const orderData = req.body;
      const newOrder = await this.orderService.createOrder(orderData);
      res.locals.newOrder = newOrder;
      res.status(201).json(newOrder);
    } catch (error: any) {
      console.error('Error creating order:', error);
      res.status(500).json({ error: error.message || 'Internal server error', details: error });
    }
  };

  getAllOrders = async (req: Request, res: Response) => {
    try {
      const restaurantId = req.user?.restaurantId;
      const orders = await this.orderService.getAllOrders(restaurantId);
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  getOrderById = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { restaurantId } = req.query;
      
      let order = await this.orderService.getOrderById(id);
      
      if (!order && !isNaN(Number(id)) && restaurantId) {
        order = await this.orderService.getByOrderNumber(Number(id), restaurantId as string);
      }
      
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      res.json(order);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  updateOrderStatus = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status, paymentMethod, boxId, requiresEInvoice, invoiceData, clientId, clientDoc } = req.body;
      const restaurantId = req.user!.restaurantId;
      const updatedOrder = await this.orderService.updateOrderStatus(id, restaurantId, status, paymentMethod, boxId);
      
      if (!updatedOrder) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // Si el pedido se marca como Entregado (DELIVERED) y se solicitó Facturación Electrónica
      // inicia el proceso de recopilación de datos del cliente para enviarlos a la DIAN.
      if (status === 'DELIVERED' && requiresEInvoice) {
        let clientData: ClientDIAN;
        
        try {
        // Prioridad 1: Usar los datos manuales del formulario de factura (invoiceData)
        if (invoiceData) {
          clientData = {
            tipoPersona: invoiceData.tipoPersona || 'natural',
            razonSocial: invoiceData.razonSocial || invoiceData.nombres || updatedOrder.clientName || '',
            tipoId: invoiceData.tipoDocumento || 'CC',
            identificacion: invoiceData.identificacion || '222222222222',
            dv: invoiceData.dv || '0',
            regimenFiscal: invoiceData.regimen || '',
            responsabilidades: invoiceData.responsabilidades || '',
            departamento: invoiceData.departamento || '',
            municipio: invoiceData.municipio || '',
            direccion: invoiceData.direccion || updatedOrder.deliveryAddress || '',
            nombreContacto: invoiceData.nombres || updatedOrder.clientName || '',
            telefonoContacto: invoiceData.telefono || updatedOrder.clientPhone || '',
            emailContacto: invoiceData.email || ''
          };
        } else if (clientId) {
          const dbClient = await this.clientService.searchClients(restaurantId, clientId);
          const clientMatch = dbClient.find(c => c.id === clientId);
          if (clientMatch) {
            clientData = {
              tipoPersona: "natural",
              razonSocial: clientMatch.name || updatedOrder.clientName || '',
              tipoId: clientMatch.documentType || 'CC',
              identificacion: clientMatch.documentId || '222222222222',
              dv: clientMatch.dv || '0',
              regimenFiscal: clientMatch.regime || '',
              responsabilidades: clientMatch.responsibilities || '',
              departamento: clientMatch.department || '',
              municipio: clientMatch.city || '',
              direccion: clientMatch.address || updatedOrder.deliveryAddress || '',
              nombreContacto: clientMatch.name || updatedOrder.clientName || '',
              telefonoContacto: clientMatch.phone || updatedOrder.clientPhone || '',
              emailContacto: clientMatch.email || ''
            };
          } else {
            throw new Error("Client not found");
          }
        } else {
          // Prioridad 3: Cliente genérico (Consumidor Final) si no se proveen datos
          // Se usa el documento '222222222222' estipulado por defecto.
          clientData = {
            tipoPersona: "natural",
            razonSocial: updatedOrder.clientName || 'Consumidor Final',
            tipoId: 'CC',
            identificacion: clientDoc || '222222222222',
            dv: '0',
            regimenFiscal: '',
            responsabilidades: '',
            departamento: '',
            municipio: '',
            direccion: updatedOrder.deliveryAddress || '',
            nombreContacto: updatedOrder.clientName || '',
            telefonoContacto: updatedOrder.clientPhone || '',
            emailContacto: ''
          };
        }

          // Una vez armada la data del cliente, llamamos asincrónicamente al servicio
          // de facturación para no bloquear la respuesta inmediata de éxito al frontend.
          this.billingService.generateInvoice(updatedOrder, clientData)
            .catch(e => console.error("Fallo asincrónico al generar factura electrónica:", e));
          
        } catch (error) {
          console.error("Error al preparar los datos del cliente para FE:", error);
        }
      } else if (status === 'CANCELLED') {
        // Generar Nota de Crédito si existía una factura electrónica
        this.billingService.generateCreditNote(id)
          .catch(e => console.error("Error al generar Nota de Crédito:", e));
      }

      res.json(updatedOrder);
    } catch (error: any) {
      console.error("Error in updateOrderStatus:", error);
      res.status(500).json({ error: 'Internal server error', details: error.message || String(error) });
    }
  };

  revertOrder = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { boxId } = req.body;
      const restaurantId = req.user!.restaurantId;
      const revertedOrder = await this.orderService.revertOrder(id, restaurantId, boxId);

      if (!revertedOrder) {
        return res.status(404).json({ error: 'Order not found or not in DELIVERED status' });
      }

      res.locals.revertedOrder = revertedOrder;
      res.json(revertedOrder);
    } catch (error) {
      console.error('Error reverting order:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  assignDriver = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { driverId } = req.body;
      const restaurantId = req.user!.restaurantId;
      const updatedOrder = await this.orderService.assignDriver(id, restaurantId, driverId);
      
      if (!updatedOrder) {
        return res.status(404).json({ error: 'Order not found' });
      }

      res.locals.updatedOrder = updatedOrder;
      res.json(updatedOrder);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  getDriverOrders = async (req: Request, res: Response) => {
    try {
      const { driverId } = req.params;
      // You could also verify that req.user.id matches driverId or user is ADMIN
      const orders = await this.orderService.getDriverOrders(driverId);
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}
