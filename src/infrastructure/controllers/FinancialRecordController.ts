import { Request, Response } from 'express';
import { FinancialRecordService } from '../../application/services/FinancialRecordService';

export class FinancialRecordController {
  constructor(private service: FinancialRecordService) {}

  createRecord = async (req: Request, res: Response): Promise<void> => {
    try {
      const record = await this.service.createRecord(req.body);
      res.status(201).json(record);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  };

  getRecords = async (req: Request, res: Response): Promise<void> => {
    try {
      const { restaurantId } = req.params;
      const records = await this.service.getRecordsByRestaurant(restaurantId);
      res.status(200).json(records);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  };
}
