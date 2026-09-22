import { Request, Response } from 'express';
import { CategoryService } from '../../application/services/CategoryService';

export class CategoryController {
  constructor(private service: CategoryService) {}

  createCategory = async (req: Request, res: Response): Promise<void> => {
    try {
      const restaurantId = req.user!.restaurantId;
      const category = await this.service.createCategory({ ...req.body, restaurantId });
      res.status(201).json(category);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  };

  updateCategory = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const restaurantId = req.user!.restaurantId;
      const { name, oldName } = req.body;
      const category = await this.service.updateCategory(id, restaurantId, name, oldName);
      res.status(200).json(category);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  };

  getCategories = async (req: Request, res: Response): Promise<void> => {
    try {
      const { restaurantId } = req.params;
      const categories = await this.service.getCategoriesByRestaurant(restaurantId);
      res.status(200).json(categories);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  };

  deleteCategory = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const restaurantId = req.user!.restaurantId;
      await this.service.deleteCategory(id, restaurantId);
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  };

  reorderCategories = async (req: Request, res: Response): Promise<void> => {
    try {
      const { updates } = req.body;
      const restaurantId = req.user!.restaurantId;
      if (!Array.isArray(updates)) {
        res.status(400).json({ error: 'Updates must be an array' });
        return;
      }
      await this.service.reorderCategories(restaurantId, updates);
      res.status(200).json({ message: 'Categories reordered' });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  };
}
