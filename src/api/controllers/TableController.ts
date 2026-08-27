import { Request, Response } from 'express';
import { PrismaTableRepository } from '../../infrastructure/repositories/PrismaTableRepository';
import crypto from 'crypto';

const tableRepository = new PrismaTableRepository();

export class TableController {
  static async createTable(req: Request, res: Response) {
    try {
      const { restaurantId } = req.params;
      const { name, capacity } = req.body;

      const newTable = await tableRepository.create({
        id: crypto.randomUUID(),
        restaurantId,
        name,
        capacity,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      res.status(201).json(newTable);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error al crear la mesa' });
    }
  }

  static async getTables(req: Request, res: Response) {
    try {
      const { restaurantId } = req.params;
      const tables = await tableRepository.findByRestaurant(restaurantId);
      res.json(tables);
    } catch (error) {
      res.status(500).json({ error: 'Error al obtener las mesas' });
    }
  }

  static async deleteTable(req: Request, res: Response) {
    try {
      const { tableId } = req.params;
      await tableRepository.delete(tableId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Error al eliminar la mesa' });
    }
  }

  static async updateTable(req: Request, res: Response) {
    try {
      const { tableId } = req.params;
      const { name, capacity, isActive } = req.body;
      const updatedTable = await tableRepository.update(tableId, name, capacity, isActive);
      res.json(updatedTable);
    } catch (error) {
      res.status(500).json({ error: 'Error al actualizar la mesa' });
    }
  }
}
