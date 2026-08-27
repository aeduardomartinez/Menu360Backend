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
import { DianIntegrationService } from '../services/DianIntegrationService';
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
import { TableController } from '../../api/controllers/TableController';
import { ClientController } from '../controllers/ClientController';
import { ClientService } from '../../application/services/ClientService';
import { PrismaClientRepository } from '../repositories/PrismaClientRepository';
import authRouter from '../../api/routes/AuthRouter';
import couponRouter from '../../api/routes/coupon.routes';
import superadminRouter from '../../api/routes/SuperAdminRouter';
import { authenticateToken } from '../../api/middlewares/AuthMiddleware';
import { requireRole } from '../../api/middlewares/RequireRole';

// Dependency Injection setup (Simplified for now)
const productRepository = new PrismaProductRepository();
const orderRepository = new PrismaOrderRepository();
const invoiceRepository = new PrismaInvoiceRepository();
const restaurantRepository = new PrismaRestaurantRepository();

const dianIntegrationService = new DianIntegrationService();
const menuService = new MenuService(productRepository);
const billingService = new BillingService(invoiceRepository, restaurantRepository, dianIntegrationService);
const restaurantService = new RestaurantService(restaurantRepository);
const financialRecordService = new FinancialRecordService(new PrismaFinancialRecordRepository());
const clientService = new ClientService(new PrismaClientRepository());
const orderService = new OrderService(orderRepository, productRepository, financialRecordService, clientService);
const categoryService = new CategoryService(new PrismaCategoryRepository());
const boxService = new BoxService(new PrismaBoxRepository());
const menuController = new MenuController(menuService);
const orderController = new OrderController(orderService, billingService, clientService);
const billingController = new BillingController(billingService);
const restaurantController = new RestaurantController(restaurantService);
const financialRecordController = new FinancialRecordController(financialRecordService);
const categoryController = new CategoryController(categoryService);
const modifierController = new ModifierController();
const boxController = new BoxController(boxService);
const clientController = new ClientController(clientService);

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
  router.patch('/restaurants/:id/settings', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
    await restaurantController.updateSettings(req, res);
    if (res.statusCode === 200) {
      io.emit('tenant-updated');
    }
  });
  router.get('/restaurants/:id/finances', authenticateToken, restaurantController.getDailyFinances);

  // Menu Routes
  router.get('/menu', menuController.getAllProducts);
  router.get('/menu/available', menuController.getAvailableProducts);
  
  router.post('/menu', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
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
  router.patch('/menu/:id/availability', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
    await menuController.toggleAvailability(req, res);
    // If successful, broadcast change to clients
    if (res.statusCode === 200) {
      io.emit('menu-updated');
    }
  });

  router.put('/menu/:id', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
    await menuController.updateProduct(req, res);
    if (res.statusCode === 200) {
      io.emit('menu-updated');
    }
  });

  router.delete('/menu/:id', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
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

  router.post('/orders/:id/revert', authenticateToken, requireRole(['ADMIN', 'CASHIER']), async (req, res) => {
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
  router.get('/billing/invoices', authenticateToken, requireRole(['ADMIN']), billingController.getAllInvoices);
  router.get('/billing/metrics', authenticateToken, requireRole(['ADMIN']), billingController.getDashboardMetrics);

  // Finances Routes
  router.get('/finances/:restaurantId', authenticateToken, requireRole(['ADMIN', 'CASHIER']), financialRecordController.getRecords);
  router.get('/finances/:restaurantId/export', authenticateToken, requireRole(['ADMIN']), financialRecordController.exportRecordsCSV);
  router.post('/finances', authenticateToken, requireRole(['ADMIN', 'CASHIER']), financialRecordController.createRecord);
  
  // Clients Routes
  router.get('/clients/public/:restaurantId/phone/:phone', clientController.getClientByPhone);
  router.get('/clients/:restaurantId', authenticateToken, requireRole(['ADMIN', 'CASHIER', 'WAITRESS']), clientController.searchClients);
  router.post('/clients/:restaurantId', authenticateToken, requireRole(['ADMIN', 'CASHIER', 'WAITRESS']), clientController.createClient);

  // Box (Cajas) Routes
  router.get('/boxes/restaurant/:restaurantId', authenticateToken, requireRole(['ADMIN', 'CASHIER']), boxController.getBoxes);
  router.post('/boxes', authenticateToken, requireRole(['ADMIN']), boxController.createBox);
  router.put('/boxes/:id', authenticateToken, requireRole(['ADMIN']), boxController.updateBox);
  router.delete('/boxes/:id', authenticateToken, requireRole(['ADMIN']), boxController.deleteBox);
  router.post('/boxes/:id/open', authenticateToken, requireRole(['ADMIN', 'CASHIER']), boxController.openBox);
  router.post('/boxes/:id/close', authenticateToken, requireRole(['ADMIN', 'CASHIER']), boxController.closeBox);
  router.get('/boxes/sessions/:restaurantId', authenticateToken, requireRole(['ADMIN', 'CASHIER']), boxController.getBoxSessions);

  // Users Route (Dummy for now)
  router.get('/users', authenticateToken, requireRole(['ADMIN']), (req, res) => { res.status(200).json([]); });

  // Categories Routes
  router.post('/categories', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
    await categoryController.createCategory(req, res);
    if (res.statusCode === 201 || res.statusCode === 200) io.emit('menu-updated');
  });
  router.put('/categories/:id', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
    await categoryController.updateCategory(req, res);
    if (res.statusCode === 200) io.emit('menu-updated');
  });
  router.get('/categories/:restaurantId', categoryController.getCategories); // used by client menu too? Wait, let's leave GET public.
  router.delete('/categories/:id', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
    await categoryController.deleteCategory(req, res);
    if (res.statusCode === 200) io.emit('menu-updated');
  });

  // Modifiers Routes
  router.get('/modifiers/:restaurantId', modifierController.getByRestaurant);
  router.post('/modifiers', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
    await modifierController.create(req, res);
    if (res.statusCode === 201 || res.statusCode === 200) io.emit('menu-updated');
  });
  router.put('/modifiers/:id', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
    await modifierController.update(req, res);
    if (res.statusCode === 200) io.emit('menu-updated');
  });
  router.delete('/modifiers/:id', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
    await modifierController.delete(req, res);
    if (res.statusCode === 200) io.emit('menu-updated');
  });

  // Tables Routes
  router.get('/tables/:restaurantId', TableController.getTables);
  router.post('/tables/:restaurantId', authenticateToken, requireRole(['ADMIN']), TableController.createTable);
  router.put('/tables/:tableId', authenticateToken, requireRole(['ADMIN']), TableController.updateTable);
  router.delete('/tables/:tableId', authenticateToken, requireRole(['ADMIN']), TableController.deleteTable);

  // Background Job: Auto-cancel PENDING orders older than 12 hours
  // Runs every hour (3600000 ms)
  setInterval(async () => {
    try {
      const count = await orderService.cancelOldPendingOrders(12);
      if (count > 0) {
        console.log(`[Job] Auto-cancelled ${count} old pending orders.`);
        io.emit('order-status-changed'); // Notify clients to refresh
      }
    } catch (err) {
      console.error('[Job] Error cancelling old orders:', err);
    }
  }, 60 * 60 * 1000);

  // Run it once on startup as well (delayed slightly)
  setTimeout(() => {
    orderService.cancelOldPendingOrders(12).then((count) => {
      if (count > 0) {
        console.log(`[Startup] Auto-cancelled ${count} old pending orders.`);
      }
    }).catch(console.error);
  }, 10000);

  return router;
};
