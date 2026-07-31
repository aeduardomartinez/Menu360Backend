import { Router } from 'express';
import { MenuController } from '../controllers/MenuController';
import { OrderController } from '../controllers/OrderController';
import { BillingController } from '../controllers/BillingController';
import { PrismaProductRepository } from '../repositories/PrismaProductRepository';
import { PrismaOrderRepository } from '../repositories/PrismaOrderRepository';
import { PrismaInvoiceRepository } from '../repositories/PrismaInvoiceRepository';
import { MenuService } from '../../application/services/MenuService';
import { OrderService } from '../../application/services/OrderService';
import { BillingService } from '../../application/services/BillingService';
import { RestaurantService } from '../../application/services/RestaurantService';
import { RestaurantController } from '../controllers/RestaurantController';
import { Server as SocketIOServer } from 'socket.io';
import { PrismaRestaurantRepository } from '../repositories/PrismaRestaurantRepository';
import { PrismaFinancialRecordRepository } from '../repositories/PrismaFinancialRecordRepository';
import { PrismaCategoryRepository } from '../repositories/PrismaCategoryRepository';
import { FinancialRecordService } from '../../application/services/FinancialRecordService';
import { CategoryService } from '../../application/services/CategoryService';
import { FinancialRecordController } from '../controllers/FinancialRecordController';
import { CategoryController } from '../controllers/CategoryController';
import { ModifierController } from '../controllers/ModifierController';
import { PrismaBoxRepository } from '../repositories/PrismaBoxRepository';
import { BoxService } from '../../application/services/BoxService';
import { BoxController } from '../controllers/BoxController';
import authRouter from '../../api/routes/AuthRouter';
import couponRouter from '../../api/routes/coupon.routes';
import superadminRouter from '../../api/routes/SuperAdminRouter';
import { authenticateToken } from '../../api/middlewares/AuthMiddleware';

// Dependency Injection setup (Simplified for now)
const productRepository = new PrismaProductRepository();
const orderRepository = new PrismaOrderRepository();
const invoiceRepository = new PrismaInvoiceRepository();
const restaurantRepository = new PrismaRestaurantRepository();

const menuService = new MenuService(productRepository);
const billingService = new BillingService(invoiceRepository);
const restaurantService = new RestaurantService(restaurantRepository);
const financialRecordService = new FinancialRecordService(new PrismaFinancialRecordRepository());
const orderService = new OrderService(orderRepository, financialRecordService);
const categoryService = new CategoryService(new PrismaCategoryRepository());
const boxService = new BoxService(new PrismaBoxRepository());

const menuController = new MenuController(menuService);
const orderController = new OrderController(orderService, billingService);
const billingController = new BillingController(billingService);
const restaurantController = new RestaurantController(restaurantService);
const financialRecordController = new FinancialRecordController(financialRecordService);
const categoryController = new CategoryController(categoryService);
const modifierController = new ModifierController();
const boxController = new BoxController(boxService);

export const setupRoutes = (io: SocketIOServer): Router => {
  const router = Router();
  
  // Auth Routes
  router.use('/auth', authRouter);
  
  // Coupon Routes (Coupons has some public and some protected routes, but wait, the couponRouter needs auth for Admin routes? Yes, let's leave auth in couponRouter or map them individually).
  // I will just mount it, we should add authenticateToken inside coupon.routes if needed, but for now let's just mount it.
  router.use('/coupons', couponRouter);
  router.use('/superadmin', superadminRouter);
  
  // Restaurant Routes
  router.get('/restaurants/:slug', restaurantController.getBySlug);
  router.patch('/restaurants/:id/settings', authenticateToken, async (req, res) => {
    await restaurantController.updateSettings(req, res);
    if (res.statusCode === 200) {
      io.emit('tenant-updated');
    }
  });
  router.get('/restaurants/:id/finances', authenticateToken, restaurantController.getDailyFinances);

  // Menu Routes
  router.get('/menu', menuController.getAllProducts);
  router.get('/menu/available', menuController.getAvailableProducts);
  
  router.post('/menu', authenticateToken, async (req, res) => {
    // Inject restaurantId from token
    if (req.user && !req.body.restaurantId) {
      req.body.restaurantId = req.user.restaurantId;
    }
    await menuController.createProduct(req, res);
    if (res.statusCode === 201) {
      io.emit('menu-updated');
    }
  });
  
  // Custom wrapper for toggle to emit socket event
  router.patch('/menu/:id/availability', authenticateToken, async (req, res) => {
    await menuController.toggleAvailability(req, res);
    // If successful, broadcast change to clients
    if (res.statusCode === 200) {
      io.emit('menu-updated');
    }
  });

  router.put('/menu/:id', authenticateToken, async (req, res) => {
    await menuController.updateProduct(req, res);
    if (res.statusCode === 200) {
      io.emit('menu-updated');
    }
  });

  router.delete('/menu/:id', authenticateToken, async (req, res) => {
    await menuController.deleteProduct(req, res);
    if (res.statusCode === 200) {
      io.emit('menu-updated');
    }
  });

  // Order Routes
  router.post('/orders', async (req, res) => {
    await orderController.createOrder(req, res);
    if (res.statusCode === 201) {
      io.emit('new-order', res.locals.newOrder);
    }
  });
  
  router.get('/orders', authenticateToken, orderController.getAllOrders);
  router.get('/orders/:id', orderController.getOrderById);

  router.patch('/orders/:id/status', authenticateToken, async (req, res) => {
    await orderController.updateOrderStatus(req, res);
    if (res.statusCode === 200) {
      io.emit('order-updated');
    }
  });

  router.post('/orders/:id/revert', authenticateToken, async (req, res) => {
    await orderController.revertOrder(req, res);
    if (res.statusCode === 200) {
      io.emit('order-updated');
    }
  });

  router.patch('/orders/:id/assign', authenticateToken, async (req, res) => {
    await orderController.assignDriver(req, res);
    if (res.statusCode === 200) {
      io.emit('order-updated');
      io.emit('order-assigned', { orderId: req.params.id, driverId: req.body.driverId });
    }
  });

  router.get('/orders/driver/:driverId', authenticateToken, orderController.getDriverOrders);

  // Billing Routes
  router.get('/billing/invoices', authenticateToken, billingController.getAllInvoices);
  router.get('/billing/metrics', authenticateToken, billingController.getDashboardMetrics);

  // Finances Routes
  router.get('/finances/:restaurantId', authenticateToken, financialRecordController.getRecords);
  router.post('/finances', authenticateToken, financialRecordController.createRecord);
  
  // Box (Cajas) Routes
  router.get('/boxes/restaurant/:restaurantId', authenticateToken, boxController.getBoxes);
  router.post('/boxes', authenticateToken, boxController.createBox);
  router.put('/boxes/:id', authenticateToken, boxController.updateBox);
  router.delete('/boxes/:id', authenticateToken, boxController.deleteBox);
  router.post('/boxes/:id/open', authenticateToken, boxController.openBox);
  router.post('/boxes/:id/close', authenticateToken, boxController.closeBox);
  router.get('/boxes/sessions/:restaurantId', authenticateToken, boxController.getBoxSessions);

  // Users Route (Dummy for now)
  router.get('/users', authenticateToken, (req, res) => { res.status(200).json([]); });

  // Categories Routes
  router.post('/categories', authenticateToken, categoryController.createCategory);
  router.put('/categories/:id', authenticateToken, categoryController.updateCategory);
  router.get('/categories/:restaurantId', categoryController.getCategories); // used by client menu too? Wait, let's leave GET public.
  router.delete('/categories/:id', authenticateToken, categoryController.deleteCategory);

  // Modifiers Routes
  router.get('/modifiers/:restaurantId', modifierController.getByRestaurant);
  router.post('/modifiers', authenticateToken, modifierController.create);
  router.put('/modifiers/:id', authenticateToken, modifierController.update);
  router.delete('/modifiers/:id', authenticateToken, modifierController.delete);

  return router;
};
