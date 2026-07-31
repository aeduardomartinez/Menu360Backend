import { Request, Response } from 'express';
import { modifierRepository } from '../repositories/PrismaModifierRepository';

export class ModifierController {
  async getByRestaurant(req: Request, res: Response) {
    try {
      const { restaurantId } = req.params;
      const modifiers = await modifierRepository.findByRestaurant(restaurantId);
      res.json(modifiers);
    } catch (e) {
      res.status(500).json({ error: 'Internal error' });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const modifier = await modifierRepository.create(req.body);
      // Emit socket event if needed
      res.status(201).json(modifier);
    } catch (e) {
      res.status(500).json({ error: 'Internal error' });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const modifier = await modifierRepository.update(id, req.body);
      if (!modifier) {
        return res.status(404).json({ error: 'Modifier not found' });
      }
      res.json(modifier);
    } catch (e) {
      res.status(500).json({ error: 'Internal error' });
    }
  }

  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const success = await modifierRepository.delete(id);
      if (!success) {
        return res.status(404).json({ error: 'Modifier not found' });
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Internal error' });
    }
  }
}
