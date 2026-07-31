import { Request, Response } from 'express';
import { CategoryService } from '../../application/services/CategoryService';

export class CategoryController {
  constructor(private service: CategoryService) {}

  createCategory = async (req: Request, res: Response): Promise<void> => {
    try {
      const category = await this.service.createCategory(req.body);
      res.status(201).json(category);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  };

  updateCategory = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { name, oldName } = req.body;
      const category = await this.service.updateCategory(id, name, oldName);
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
      await this.service.deleteCategory(id);
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  };
}
