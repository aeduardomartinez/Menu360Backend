import { Request, Response } from 'express';
import { BoxService } from '../../application/services/BoxService';
import { prisma } from '../db/prisma';

export class BoxController {
  constructor(private service: BoxService) {}

  getBoxes = async (req: Request, res: Response) => {
    try {
      const { restaurantId } = req.params;
      const boxes = await this.service.getBoxesByRestaurant(restaurantId);
      res.json(boxes);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  createBox = async (req: Request, res: Response) => {
    try {
      const newBox = await this.service.createBox(req.body);
      res.status(201).json(newBox);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  updateBox = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updatedBox = await this.service.updateBox(id, req.body);
      if (!updatedBox) return res.status(404).json({ error: 'Box not found' });
      res.json(updatedBox);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  openBox = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { initialAmount } = req.body;
      const openedBox = await this.service.openBox(id, initialAmount);
      if (!openedBox) return res.status(404).json({ error: 'Box not found' });
      res.json(openedBox);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  closeBox = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const closedBox = await this.service.closeBox(id, req.body);
      if (!closedBox) return res.status(404).json({ error: 'Box not found' });
      res.json(closedBox);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  getBoxSessions = async (req: Request, res: Response) => {
    try {
      const { restaurantId } = req.params;
      const sessions = await prisma.boxSession.findMany({
        where: { restaurantId },
        orderBy: { closedAt: 'desc' },
        include: { user: true, box: true }
      });
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  deleteBox = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await this.service.deleteBox(id);
      res.status(204).send();
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Internal server error' });
    }
  };
}
