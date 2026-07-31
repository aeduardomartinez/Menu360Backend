import { Request, Response } from 'express';
import { RestaurantService } from '../../application/services/RestaurantService';

export class RestaurantController {
  constructor(private restaurantService: RestaurantService) {}

  getBySlug = async (req: Request, res: Response) => {
    try {
      const { slug } = req.params;
      let restaurant = await this.restaurantService.getRestaurantBySlug(slug);
      
      // Fallback: If not found by slug, maybe the frontend passed the ID
      if (!restaurant) {
        restaurant = await this.restaurantService.getRestaurantById(slug);
      }
      
      if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });
      res.json(restaurant);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  updateSettings = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const data = req.body; // Expects { name, themeColor, logoBase64 }
      
      const updated = await this.restaurantService.updateRestaurant(id, data);
      res.json(updated);
    } catch (error: any) {
      console.error('Update settings error:', error);
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  };

  getDailyFinances = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      // In a real app we'd query the DB for orders of this restaurant created today.
      // Since it's in-memory and we don't have createdAt, we mock the daily finances for now.
      res.json({
        totalSales: 450000,
        ordersCount: 15,
        topSellingProduct: 'Hamburguesa Sencilla'
      });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}
