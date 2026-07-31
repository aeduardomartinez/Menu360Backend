import { Request, Response } from 'express';
import { MenuService } from '../../application/services/MenuService';

export class MenuController {
  constructor(private menuService: MenuService) {}

  getAllProducts = async (req: Request, res: Response) => {
    try {
      const { restaurantId } = req.query;
      if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' });
      const products = await this.menuService.getAllProducts(restaurantId as string);
      res.json(products);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  getAvailableProducts = async (req: Request, res: Response) => {
    try {
      const { restaurantId } = req.query;
      if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' });
      const products = await this.menuService.getAvailableProducts(restaurantId as string);
      res.json(products);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  createProduct = async (req: Request, res: Response) => {
    try {
      const productData = req.body;
      // Default to a placeholder image if none provided
      if (!productData.imageUrl) {
        productData.imageUrl = 'https://via.placeholder.com/150';
      }
      productData.isAvailable = true;
      const newProduct = await this.menuService.addProduct(productData);
      res.status(201).json(newProduct);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  toggleAvailability = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { isAvailable } = req.body;
      const updatedProduct = await this.menuService.toggleProductAvailability(id, isAvailable);
      
      if (!updatedProduct) {
        return res.status(404).json({ error: 'Product not found' });
      }

      res.json(updatedProduct);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  updateProduct = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const productData = req.body;
      
      const updatedProduct = await this.menuService.updateProduct(id, productData);
      
      if (!updatedProduct) {
        return res.status(404).json({ error: 'Product not found' });
      }

      res.json(updatedProduct);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  deleteProduct = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      const deleted = await this.menuService.deleteProduct(id);
      
      if (!deleted) {
        return res.status(404).json({ error: 'Product not found' });
      }

      res.json({ message: 'Product deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}
