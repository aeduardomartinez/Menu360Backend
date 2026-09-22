import { Request, Response } from 'express';
import { FinancialRecordService } from '../../application/services/FinancialRecordService';

export class FinancialRecordController {
  constructor(private service: FinancialRecordService) {}

  createRecord = async (req: Request, res: Response): Promise<void> => {
    try {
      // El restaurante siempre sale del token verificado, no de lo que mande
      // el cliente — si no, cualquier cajero podría inyectar movimientos en
      // la contabilidad de otro restaurante.
      const restaurantId = req.user!.restaurantId;
      const record = await this.service.createRecord({ ...req.body, restaurantId });
      res.status(201).json(record);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  };

  getRecords = async (req: Request, res: Response): Promise<void> => {
    try {
      const { restaurantId } = req.params;
      if (restaurantId !== req.user?.restaurantId) {
        res.status(403).json({ error: 'No tienes acceso a la contabilidad de otro restaurante.' });
        return;
      }
      const records = await this.service.getRecordsByRestaurant(restaurantId);
      res.status(200).json(records);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  };

  exportRecordsCSV = async (req: Request, res: Response): Promise<void> => {
    try {
      const { restaurantId } = req.params;
      if (restaurantId !== req.user?.restaurantId) {
        res.status(403).json({ error: 'No tienes acceso a la contabilidad de otro restaurante.' });
        return;
      }
      const records = await this.service.getRecordsByRestaurant(restaurantId);
      
      const header = ['ID', 'Fecha', 'Tipo', 'Categoría', 'Método Pago', 'Monto', 'Descripción'];
      const rows = records.map(r => [
        r.id,
        new Date(r.date).toLocaleString(),
        r.type,
        r.category,
        r.paymentMethod || 'N/A',
        r.amount.toString(),
        `"${(r.description || '').replace(/"/g, '""')}"`
      ]);
      
      const csvContent = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=contabilidad_${restaurantId}_${new Date().getTime()}.csv`);
      res.status(200).send(csvContent);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  };
}
