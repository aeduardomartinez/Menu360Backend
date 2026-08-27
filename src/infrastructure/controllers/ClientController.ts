import { Request, Response } from 'express';
import { ClientService } from '../../application/services/ClientService';

export class ClientController {
  constructor(private service: ClientService) { }

  createClient = async (req: Request, res: Response): Promise<void> => {
    try {
      const { restaurantId } = req.params;
      const client = await this.service.createClient({ ...req.body, restaurantId });
      res.status(201).json(client);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  };

  searchClients = async (req: Request, res: Response): Promise<void> => {
    try {
      const { restaurantId } = req.params;
      const { q } = req.query;
      const queryStr = q ? String(q) : '';

      const clients = await this.service.searchClients(restaurantId, queryStr);
      res.status(200).json(clients);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  };

  getClientByPhone = async (req: Request, res: Response): Promise<void> => {
    try {
      const { restaurantId, phone } = req.params;
      const client = await this.service.getClientByExactPhone(restaurantId, phone);
      if (!client) {
        res.status(404).json({ message: 'Client not found' });
        return;
      }
      res.status(200).json(client);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  };
}
