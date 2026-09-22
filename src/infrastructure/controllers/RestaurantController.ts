import { Request, Response } from 'express';
import { RestaurantService } from '../../application/services/RestaurantService';
import { BUSINESS_DAY_START_HOUR } from '../../shared/businessDay';

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
      // La hora en que arranca la jornada viaja junto al restaurante para que
      // el panel calcule "hoy" igual que el servidor (caja, filtros del
      // historial) sin tener el número repetido en el frontend. No se guarda
      // en la base: hoy es un valor único del sistema (ver shared/businessDay).
      res.json({ ...restaurant, businessDayStartHour: BUSINESS_DAY_START_HOUR });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  updateSettings = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      if (id !== req.user?.restaurantId) {
        return res.status(403).json({ error: 'No tienes permiso para modificar la configuración de otro restaurante.' });
      }
      const data = req.body; // Expects { name, themeColor, logoUrl }

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
      if (id !== req.user?.restaurantId) {
        return res.status(403).json({ error: 'No tienes permiso para ver las finanzas de otro restaurante.' });
      }
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
