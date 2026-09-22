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
import { ClientErrorController } from '../controllers/ClientErrorController';
import { logger } from '../../shared/utils/logger';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { UploadController } from '../controllers/UploadController';
import { firebaseStorage } from '../services/FirebaseStorageService';

// Dependency Injection setup (Simplified for now)
const productRepository = new PrismaProductRepository();
const orderRepository = new PrismaOrderRepository();
const invoiceRepository = new PrismaInvoiceRepository();
const restaurantRepository = new PrismaRestaurantRepository();

const dianIntegrationService = new DianIntegrationService();
const menuService = new MenuService(productRepository, firebaseStorage);
const billingService = new BillingService(invoiceRepository, restaurantRepository, dianIntegrationService);
const restaurantService = new RestaurantService(restaurantRepository, firebaseStorage);
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
import { PosterioriInvoiceController } from '../controllers/PosterioriInvoiceController';
import { EmitPosterioriInvoiceUseCase } from '../../application/use-cases/EmitPosterioriInvoiceUseCase';

const clientController = new ClientController(clientService);
const clientErrorController = new ClientErrorController();

const emitPosterioriInvoiceUseCase = new EmitPosterioriInvoiceUseCase(orderRepository, billingService, financialRecordService);
const posterioriInvoiceController = new PosterioriInvoiceController(emitPosterioriInvoiceUseCase);

// La ruta pública de seguimiento de pedido (GET /orders/:id) tiene que seguir
// funcionando sin sesión, porque así la usa un cliente que nunca inició sesión.
// Solo acepta el id real (un uuid, no adivinable), así que no hace falta nada
// más — este limitador es únicamente defensa en profundidad.
const orderTrackingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 30,
  message: { error: 'Demasiadas búsquedas de pedidos desde esta IP. Intenta de nuevo en unos minutos.' },
});

// El número de pedido visible (#0102, secuencial) SÍ es adivinable, y el
// restaurantId que lo acompaña es público (viaja en la URL de la tienda). Por
// eso esta ruta exige además el teléfono del pedido, y por eso lleva un límite
// de intentos estricto: sin él, cualquiera podría recorrer 1, 2, 3... probando
// teléfonos y descargarse el nombre, teléfono y dirección de otros clientes.
const orderPhoneTrackingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20,
  message: { error: 'Demasiados intentos de verificación. Intenta de nuevo en unos minutos.' },
});

// GET /clients/public/:restaurantId/phone/:phone es pública (autocompleta el
// checkout de un cliente que ya pidió antes) y no exige nada más que el
// teléfono. Sin límite propio, alguien podría recorrer números de teléfono al
// azar y armar una base de datos de los clientes de un restaurante (nombre,
// dirección) usando solo el límite general de 300 peticiones/5min por IP.
const clientPhoneLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20,
  message: { error: 'Demasiadas búsquedas de cliente desde esta IP. Intenta de nuevo en unos minutos.' },
});

// Reporte de errores del navegador (sin sesión, puede pasar antes del
// login). Un límite generoso pero acotado: es diagnóstico, no algo que un
// usuario legítimo dispare seguido, así que un volumen alto desde una misma
// IP es más probable que sea abuso que uso real.
const clientErrorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 60,
  message: { error: 'Demasiados reportes de error desde esta IP. Intenta de nuevo en unos minutos.' },
});

// Subida de imágenes. Va limitada aunque exija sesión de administrador: cada
// subida gasta CPU (sharp redimensiona y recomprime) y almacenamiento que se
// paga. Cargar una carta entera de golpe son unas decenas de imágenes, así
// que 100 cada cuarto de hora deja trabajar con holgura y a la vez acota lo
// que puede hacer una credencial robada antes de que alguien lo note.
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Demasiadas imágenes subidas seguidas. Espera unos minutos.' },
});

// En memoria y no en disco: el archivo se va derecho a Firebase y no deja
// basura en el servidor. El tope de 8 MB es un cortafuegos, no el tamaño
// esperado — el navegador ya manda las imágenes redimensionadas muy por
// debajo de eso (ver uploadImage en frontend/src/utils/image.ts).
const subidaImagen = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 4 },
});

const uploadController = new UploadController();

export const setupRoutes = (io: SocketIOServer): Router => {
  const router = Router();

  // Reporte de errores de frontend (público, ver clientErrorLimiter arriba)
  router.post('/client-errors', clientErrorLimiter, clientErrorController.report);

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

  // Subida de imágenes (platos, logos, portadas y logos de banco).
  // El orden de los middlewares importa: multer va DESPUÉS de autenticar, o
  // estaríamos procesando archivos de gente que ni siquiera inició sesión.
  router.post(
    '/uploads',
    authenticateToken,
    requireRole(['ADMIN']),
    uploadLimiter,
    subidaImagen.single('file'),
    uploadController.uploadImage
  );

  // Menu Routes
  router.get('/menu', menuController.getAllProducts);
  router.get('/menu/available', menuController.getAvailableProducts);
  
  router.post('/menu', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
    // El restaurante siempre sale del token, nunca de lo que mande el
    // cliente en el cuerpo — si no, un admin podría crear un producto a
    // nombre de otro restaurante con solo incluir su restaurantId en el body.
    if (req.user) {
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
  router.get('/orders/driver/:driverId', authenticateToken, orderController.getDriverOrders);
  router.post('/orders/track', orderPhoneTrackingLimiter, orderController.trackOrderByPhone);
  router.get('/orders/:id', orderTrackingLimiter, orderController.getOrderById);

  router.post('/orders/:id/electronic-invoice', authenticateToken, posterioriInvoiceController.emit);

  router.patch('/orders/:id/status', authenticateToken, async (req, res) => {
    await orderController.updateOrderStatus(req, res);
    if (res.statusCode === 200) {
      io.emit('order-updated');
    }
  });

  router.patch('/orders/:id/payment-status', authenticateToken, async (req, res) => {
    await orderController.updatePaymentStatus(req, res);
    if (res.statusCode === 200) {
      io.emit('order-updated');
    }
  });

  router.patch('/orders/:id/driver-cash', authenticateToken, async (req, res) => {
    await orderController.updateDriverConfirmedCash(req, res);
    if (res.statusCode === 200) {
      io.emit('order-updated');
    }
  });

  // El restaurante acepta un pedido que llegó de la web. No cambia el estado
  // del pedido: sigue "Pendiente" hasta que lo pasen a preparación a mano
  // (ver OrderService.acceptOrder).
  router.patch('/orders/:id/accept', authenticateToken, requireRole(['ADMIN', 'CASHIER', 'WAITRESS']), async (req, res) => {
    await orderController.acceptOrder(req, res);
    if (res.statusCode === 200) {
      io.emit('order-updated');
    }
  });

  // El cajero confirma que la transferencia llegó a la cuenta. Solo habilita
  // despachar y facturar el pedido: no registra la venta (ver
  // OrderService.updateTransferConfirmed).
  router.patch('/orders/:id/transfer-confirmed', authenticateToken, requireRole(['ADMIN', 'CASHIER']), async (req, res) => {
    await orderController.updateTransferConfirmed(req, res);
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
      io.emit('order-assigned', { orderId: req.params.id, driverId: req.body.driverId, order: res.locals.updatedOrder });
    }
  });


  // Billing Routes
  router.get('/billing/invoices', authenticateToken, requireRole(['ADMIN']), billingController.getAllInvoices);
  router.get('/billing/metrics', authenticateToken, requireRole(['ADMIN']), billingController.getDashboardMetrics);

  // Finances Routes
  router.get('/finances/:restaurantId', authenticateToken, requireRole(['ADMIN', 'CASHIER']), financialRecordController.getRecords);
  router.get('/finances/:restaurantId/export', authenticateToken, requireRole(['ADMIN']), financialRecordController.exportRecordsCSV);
  router.post('/finances', authenticateToken, requireRole(['ADMIN', 'CASHIER']), financialRecordController.createRecord);
  
  // Clients Routes
  router.get('/clients/public/:restaurantId/phone/:phone', clientPhoneLookupLimiter, clientController.getClientByPhone);
  router.get('/clients/:restaurantId', authenticateToken, requireRole(['ADMIN', 'CASHIER', 'WAITRESS']), clientController.searchClients);
  router.post('/clients/:restaurantId', authenticateToken, requireRole(['ADMIN', 'CASHIER', 'WAITRESS']), clientController.createClient);
  router.patch('/clients/:restaurantId/:clientId', authenticateToken, requireRole(['ADMIN', 'CASHIER', 'WAITRESS']), clientController.updateClient);

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
  router.patch('/categories/reorder', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
    await categoryController.reorderCategories(req, res);
    if (res.statusCode === 200) io.emit('menu-updated');
  });
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
        logger.info(`[Job] Auto-cancelled ${count} old pending orders.`);
        io.emit('order-status-changed'); // Notify clients to refresh
      }
    } catch (err: any) {
      logger.error('[Job] Error cancelling old orders', { message: err?.message, stack: err?.stack });
    }
  }, 60 * 60 * 1000);

  // Run it once on startup as well (delayed slightly)
  setTimeout(() => {
    orderService.cancelOldPendingOrders(12).then((count) => {
      if (count > 0) {
        logger.info(`[Startup] Auto-cancelled ${count} old pending orders.`);
      }
    }).catch((err: any) => logger.error('[Startup] Error cancelling old orders', { message: err?.message, stack: err?.stack }));
  }, 10000);

  // Background Job: Cierra pedidos de días anteriores que se quedaron sin
  // facturar (la caja de ese día no se cerró a tiempo). Corre cada hora —
  // no hace falta que sea justo a medianoche, ya que la condición ("creado
  // antes de hoy") se vuelve verdadera sola en cuanto cambia el día.
  const runCloseStaleUnbilledOrders = (label: string) => {
    orderService.closeStaleUnbilledOrders().then(({ completed, cancelledForDriver }) => {
      if (completed > 0 || cancelledForDriver > 0) {
        logger.info(`[${label}] Cerrados ${completed} pedido(s) de día(s) anterior(es) como completados y ${cancelledForDriver} cancelado(s) por tener domiciliario asignado.`);
        io.emit('order-updated'); // Notifica a los paneles (admin y domiciliarios) para que refresquen
      }
    }).catch((err: any) => logger.error(`[${label}] Error cerrando pedidos de días anteriores`, { message: err?.message, stack: err?.stack }));

    // Domicilios en efectivo que sí se entregaron pero se quedaron esperando
    // que alguien confirmara el efectivo (cajero o domiciliario) de un día
    // anterior: se cierran asumiendo que sí se cobraron, registrando su
    // ingreso, en vez de quedarse "Esperando efectivo" para siempre.
    orderService.closeStalePendingCashDeliveries().then((closedCount) => {
      if (closedCount > 0) {
        logger.info(`[${label}] Cerrados ${closedCount} domicilio(s) en efectivo de día(s) anterior(es) sin confirmar (efectivo asumido cobrado).`);
        io.emit('order-updated');
      }
    }).catch((err: any) => logger.error(`[${label}] Error cerrando domicilios en efectivo sin confirmar`, { message: err?.message, stack: err?.stack }));
  };

  setInterval(() => runCloseStaleUnbilledOrders('Job'), 60 * 60 * 1000);
  setTimeout(() => runCloseStaleUnbilledOrders('Startup'), 15000);

  return router;
};
