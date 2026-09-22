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
      const { startDate, endDate, search } = req.query;
      const orders = await this.orderService.getAllOrders(restaurantId, {
        startDate: typeof startDate === 'string' ? startDate : undefined,
        endDate: typeof endDate === 'string' ? endDate : undefined,
        search: typeof search === 'string' ? search : undefined,
      });
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  // Búsqueda pública por id real (uuid, no adivinable) — la usa la página de
  // seguimiento justo después de que el cliente hace el pedido, sin necesitar
  // sesión ni verificación adicional porque el id en sí no se puede adivinar.
  getOrderById = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const order = await this.orderService.getOrderById(id);

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      res.json(order);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  // Búsqueda pública por número de pedido (secuencial, #0001, #0002...) — a
  // diferencia del id real, este número SÍ es adivinable, así que exigimos
  // que el teléfono del pedido coincida antes de devolver ningún dato. La
  // respuesta ante un fallo es siempre el mismo 404 genérico, para no revelar
  // si lo que falló fue el número de pedido o el teléfono.
  trackOrderByPhone = async (req: Request, res: Response) => {
    try {
      const { orderNumber, phone, restaurantId } = req.body;

      if (!orderNumber || isNaN(Number(orderNumber)) || !phone || !restaurantId) {
        return res.status(400).json({ error: 'Faltan datos para buscar el pedido.' });
      }

      const order = await this.orderService.getOrderByNumberAndPhone(Number(orderNumber), restaurantId, phone);

      if (!order) {
        return res.status(404).json({ error: 'No se encontró ningún pedido con esos datos.' });
      }
      res.json(order);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  updateOrderStatus = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status, paymentMethod, boxId, requiresEInvoice, invoiceData, clientId, clientDoc, cashReceived } = req.body;
      const restaurantId = req.user!.restaurantId;
      // cashReceived llega como texto desde la ventana de cobro; se normaliza
      // acá para no confiar en el formato del cliente.
      const cashReceivedNum = cashReceived !== undefined && cashReceived !== null && cashReceived !== ''
        ? Number(String(cashReceived).replace(/[^\d]/g, ''))
        : undefined;
      const updatedOrder = await this.orderService.updateOrderStatus(id, restaurantId, status, paymentMethod, boxId, cashReceivedNum);
      
      if (!updatedOrder) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // Procesar y guardar los datos de facturación del cliente si se proveen, independientemente
      // de si se genera factura electrónica o no
      let finalClientData: ClientDIAN | null = null;
      if (invoiceData) {
        finalClientData = {
          tipoPersona: invoiceData.tipoPersona || (invoiceData.tipoId === 'NIT' ? 'juridica' : 'natural'),
          razonSocial: invoiceData.razonSocial || invoiceData.nombreContacto || invoiceData.nombres || updatedOrder.clientName || '',
          tipoId: invoiceData.tipoId || invoiceData.tipoDocumento || 'CC',
          identificacion: invoiceData.identificacion || '',
          dv: invoiceData.dv || '',
          regimenFiscal: invoiceData.regimenFiscal || invoiceData.regimen || '',
          responsabilidades: invoiceData.responsabilidades || '',
          departamento: invoiceData.departamento || '',
          municipio: invoiceData.municipio || '',
          direccion: invoiceData.direccion || updatedOrder.deliveryAddress || '',
          nombreContacto: invoiceData.nombreContacto || invoiceData.nombres || updatedOrder.clientName || '',
          telefonoContacto: invoiceData.telefonoContacto || invoiceData.telefono || updatedOrder.clientPhone || '',
          emailContacto: invoiceData.emailContacto || invoiceData.email || ''
        };

        // Guardar o actualizar la información del cliente en la BD para futuras facturas
        this.clientService.upsertClientDIANData(restaurantId, invoiceData, clientId)
          .catch(e => console.error("Fallo asincrónico al guardar datos del cliente:", e));
      }

      // Si se solicitó Facturación Electrónica (sin importar si queda en READY o DELIVERED)
      // inicia el proceso de recopilación de datos del cliente para enviarlos a la DIAN.
      if (requiresEInvoice) {
        let clientData: ClientDIAN;
        
        try {
        // Prioridad 1: Usar los datos manuales del formulario de factura (invoiceData)
        if (finalClientData) {
          clientData = finalClientData;
        } else if (clientId) {
          const dbClient = await this.clientService.searchClients(restaurantId, clientId);
          const clientMatch = dbClient.find(c => c.id === clientId);
          if (clientMatch) {
            clientData = {
              tipoPersona: clientMatch.documentType === 'NIT' ? "juridica" : "natural",
              razonSocial: clientMatch.name || updatedOrder.clientName || '',
              tipoId: clientMatch.documentType || 'CC',
              identificacion: clientMatch.documentId || '',
              dv: clientMatch.dv || '',
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
          // Si no se proveen datos, y se exige factura electrónica, el servicio lanzará error
          // ya que no hay identificacion, correo, telefono, etc.
          clientData = {
            tipoPersona: "natural",
            razonSocial: updatedOrder.clientName || '',
            tipoId: 'CC',
            identificacion: clientDoc || '',
            dv: '',
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
      // Rechazo intencional (no un fallo del servidor): se intentó facturar
      // un pedido de un día anterior — ver OrderService.updateOrderStatus.
      if (typeof error?.message === 'string' && error.message.startsWith('STALE_ORDER_NO_BILLING|')) {
        return res.status(400).json({ error: error.message.split('|').slice(1).join('|') });
      }
      // Rechazo intencional: se intentó devolver a "En preparación" o "Listo
      // para entregar" un domicilio que ya está en camino o ya llegó.
      if (typeof error?.message === 'string' && error.message.startsWith('NO_STATUS_CHANGE_IN_TRANSIT|')) {
        return res.status(400).json({ error: error.message.split('|').slice(1).join('|') });
      }
      console.error("Error in updateOrderStatus:", error);
      res.status(500).json({ error: 'Internal server error', details: error.message || String(error) });
    }
  };

  updatePaymentStatus = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { isPaid, boxId } = req.body;
      const restaurantId = req.user!.restaurantId;
      const updatedOrder = await this.orderService.updatePaymentStatus(id, restaurantId, isPaid, boxId);
      
      if (!updatedOrder) {
        return res.status(404).json({ error: 'Order not found' });
      }

      res.locals.updatedOrder = updatedOrder;
      res.json(updatedOrder);
    } catch (error) {
      console.error('Error updating payment status:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  updateDriverConfirmedCash = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { confirmed } = req.body;
      const restaurantId = req.user!.restaurantId;
      const updatedOrder = await this.orderService.updateDriverConfirmedCash(id, restaurantId, confirmed);
      
      if (!updatedOrder) {
        return res.status(404).json({ error: 'Order not found' });
      }

      res.locals.updatedOrder = updatedOrder;
      res.json(updatedOrder);
    } catch (error) {
      console.error('Error updating driver cash status:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  updateTransferConfirmed = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { confirmed } = req.body;
      const restaurantId = req.user!.restaurantId;
      const updatedOrder = await this.orderService.updateTransferConfirmed(id, restaurantId, confirmed !== false);

      if (!updatedOrder) {
        return res.status(404).json({ error: 'Order not found' });
      }

      res.locals.updatedOrder = updatedOrder;
      res.json(updatedOrder);
    } catch (error) {
      console.error('Error updating transfer confirmation:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  acceptOrder = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const restaurantId = req.user!.restaurantId;
      const updatedOrder = await this.orderService.acceptOrder(id, restaurantId);

      if (!updatedOrder) {
        return res.status(404).json({ error: 'Order not found' });
      }

      res.locals.updatedOrder = updatedOrder;
      res.json(updatedOrder);
    } catch (error) {
      console.error('Error accepting order:', error);
      res.status(500).json({ error: 'Internal server error' });
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
    } catch (error: any) {
      // Rechazo intencional (no un fallo del servidor): se intentó reasignar
      // un domiciliario que ya salió con el pedido — ver OrderService.assignDriver.
      if (typeof error?.message === 'string' && error.message.startsWith('NO_REASSIGN_DRIVER_IN_TRANSIT|')) {
        return res.status(400).json({ error: error.message.split('|').slice(1).join('|') });
      }
      console.error('Error in assignDriver:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  getDriverOrders = async (req: Request, res: Response) => {
    try {
      const { driverId } = req.params;
      const requester = req.user!;

      // Solo el propio domiciliario, o un admin/cajero de su mismo restaurante,
      // puede consultar las entregas asignadas a un domiciliario específico.
      const isSelf = requester.userId === driverId;
      const isSupervisor = requester.role === 'ADMIN' || requester.role === 'CASHIER';
      if (!isSelf && !isSupervisor) {
        return res.status(403).json({ error: 'No tienes permiso para ver las entregas de otro domiciliario.' });
      }

      const orders = await this.orderService.getDriverOrders(driverId, requester.restaurantId);
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}
