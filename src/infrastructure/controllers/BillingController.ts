import { Request, Response } from 'express';
import { BillingService } from '../../application/services/BillingService';

export class BillingController {
  constructor(private billingService: BillingService) {}

  getAllInvoices = async (req: Request, res: Response) => {
    try {
      const restaurantId = req.user?.restaurantId;
      const invoices = await this.billingService.getAllInvoices(restaurantId);
      res.json(invoices);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  getDashboardMetrics = async (req: Request, res: Response) => {
    try {
      const restaurantId = req.user?.restaurantId;
      const invoices = await this.billingService.getAllInvoices(restaurantId);
      const totalSales = invoices.reduce((acc, inv) => acc + inv.totalAmount, 0);
      const totalInvoices = invoices.length;

      res.json({ totalSales, totalInvoices });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}
