import { Request, Response } from 'express';
import { OrderService } from '../../application/services/OrderService';
import { BillingService } from '../../application/services/BillingService';
import { ClientDIAN } from '../../domain/models/Client';

export class OrderController {
  // Controller for managing orders
  constructor(
    private orderService: OrderService,
    private billingService: BillingService
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
      const { status, paymentMethod, boxId } = req.body;
      const updatedOrder = await this.orderService.updateOrderStatus(id, status, paymentMethod, boxId);
      
      if (!updatedOrder) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // If status is DELIVERED, generate invoice (Simulated)
      if (status === 'DELIVERED') {
        const dummyClient: ClientDIAN = {
          id: 'client-1',
          documentType: 'CC',
          documentNumber: '123456789',
          businessName: updatedOrder.clientName,
          address: updatedOrder.deliveryAddress,
          phone: updatedOrder.clientPhone,
          email: 'correo@ejemplo.com',
          fiscalRegime: 'SIMPLIFIED'
        };
        await this.billingService.generateInvoice(updatedOrder, dummyClient);
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
      const revertedOrder = await this.orderService.revertOrder(id, boxId);

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
      const updatedOrder = await this.orderService.assignDriver(id, driverId);
      
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
