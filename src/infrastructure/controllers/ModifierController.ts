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
      // El restaurante siempre sale del token verificado, nunca de lo que
      // mande el cliente en el cuerpo de la petición.
      const restaurantId = req.user!.restaurantId;
      const modifier = await modifierRepository.create({ ...req.body, restaurantId });
      // Emit socket event if needed
      res.status(201).json(modifier);
    } catch (e) {
      res.status(500).json({ error: 'Internal error' });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const restaurantId = req.user!.restaurantId;
      const modifier = await modifierRepository.update(id, restaurantId, req.body);
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
      const restaurantId = req.user!.restaurantId;
      const success = await modifierRepository.delete(id, restaurantId);
      if (!success) {
        return res.status(404).json({ error: 'Modifier not found' });
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Internal error' });
    }
  }
}
