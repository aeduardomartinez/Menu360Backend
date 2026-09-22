import { Request, Response } from 'express';
import { BoxService } from '../../application/services/BoxService';
import { prisma } from '../db/prisma';

export class BoxController {
  constructor(private service: BoxService) {}

  getBoxes = async (req: Request, res: Response) => {
    try {
      const { restaurantId } = req.params;
      if (restaurantId !== req.user?.restaurantId) {
        return res.status(403).json({ error: 'No tienes acceso a las cajas de otro restaurante.' });
      }
      const boxes = await this.service.getBoxesByRestaurant(restaurantId);
      res.json(boxes);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  createBox = async (req: Request, res: Response) => {
    try {
      // El restaurante siempre sale del token verificado, nunca de lo que
      // mande el cliente en el cuerpo de la petición.
      const restaurantId = req.user!.restaurantId;
      const newBox = await this.service.createBox({ ...req.body, restaurantId });
      res.status(201).json(newBox);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  updateBox = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const restaurantId = req.user!.restaurantId;
      const updatedBox = await this.service.updateBox(id, restaurantId, req.body);
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
      const restaurantId = req.user!.restaurantId;
      const openedBox = await this.service.openBox(id, restaurantId, initialAmount);
      if (!openedBox) return res.status(404).json({ error: 'Box not found' });
      res.json(openedBox);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  closeBox = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const restaurantId = req.user!.restaurantId;
      const closedBox = await this.service.closeBox(id, restaurantId, req.body);
      if (!closedBox) return res.status(404).json({ error: 'Box not found' });
      res.json(closedBox);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  getBoxSessions = async (req: Request, res: Response) => {
    try {
      const { restaurantId } = req.params;
      if (restaurantId !== req.user?.restaurantId) {
        return res.status(403).json({ error: 'No tienes acceso a las sesiones de caja de otro restaurante.' });
      }
      const sessions = await prisma.boxSession.findMany({
        where: { restaurantId },
        orderBy: { closedAt: 'desc' },
        include: { user: true, box: true }
      });

      // For each session, attach the financial records that occurred during that session
      const sessionsWithFinances = await Promise.all(
        sessions.map(async (session) => {
          const finances = await prisma.financialRecord.findMany({
            where: {
              restaurantId,
              boxId: session.boxId,
              createdAt: {
                gte: session.openedAt,
                lte: session.closedAt
              }
            }
          });
          return { ...session, finances };
        })
      );

      res.json(sessionsWithFinances);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  deleteBox = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const restaurantId = req.user!.restaurantId;
      await this.service.deleteBox(id, restaurantId);
      res.status(204).send();
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Internal server error' });
    }
  };
}
