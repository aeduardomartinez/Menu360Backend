import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, UserRole } from '../../domain/models/User';
import { PrismaUserRepository } from '../../infrastructure/repositories/PrismaUserRepository';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Mismo criterio que en AuthMiddleware: sin valor de respaldo. Antes había un
// fallback distinto aquí ('fallback-secret-for-dev') al de AuthMiddleware
// ('super-secret-key-for-demo-purposes-only'), así que si la variable de
// entorno alguna vez faltaba, los tokens firmados y los validados podían
// terminar usando secretos distintos. Ahora, sin la variable configurada, el
// servidor no arranca.
const JWT_SECRET: string = process.env.JWT_SECRET || (() => {
  throw new Error('JWT_SECRET no está configurado. Defínelo en las variables de entorno antes de iniciar el servidor.');
})();
const JWT_EXPIRES_IN = '24h';


export class AuthService {
  private userRepository: PrismaUserRepository;

  constructor() {
    this.userRepository = new PrismaUserRepository();
    this.sembrarAdminInicial();
  }

  /**
   * Crea el primer administrador si no existe.
   *
   * Antes esto creaba siempre admin@demo.com / admin123 con rol ADMIN, en cada
   * arranque y en cualquier entorno. En local es cómodo; publicado en internet
   * es una puerta abierta con la contraseña escrita en el código fuente, y el
   * atacante no necesita adivinar nada. Por eso ahora:
   *
   *  - En producción NO se crea ningún usuario de demostración. Si se quiere
   *    sembrar el primer administrador real, se definen SEED_ADMIN_EMAIL y
   *    SEED_ADMIN_PASSWORD (y opcionalmente SEED_ADMIN_RESTAURANT_ID) en el
   *    entorno, se arranca una vez, y se borran esas variables después.
   *  - Fuera de producción se mantiene el usuario de demostración, porque ahí
   *    sí ahorra trabajo y no hay nada que proteger.
   */
  private async sembrarAdminInicial() {
    const esProduccion = process.env.NODE_ENV === 'production';
    const email = process.env.SEED_ADMIN_EMAIL;
    const password = process.env.SEED_ADMIN_PASSWORD;

    // SUPERADMIN o ADMIN. El superadministrador es el dueño de la plataforma:
    // crea y da de baja negocios, cambia planes y activa la facturación
    // electrónica. No se puede crear desde la aplicación —todas las rutas de
    // /superadmin exigen ya serlo— así que este es el único camino para el
    // primero, y por eso existe esta variable.
    const rol: UserRole = process.env.SEED_ADMIN_ROLE === 'SUPERADMIN' ? 'SUPERADMIN' : 'ADMIN';

    // El SUPERADMIN está por encima de los restaurantes y no pertenece a
    // ninguno; el ADMIN siempre pertenece a uno.
    const restaurantId = rol === 'SUPERADMIN'
      ? null
      : (process.env.SEED_ADMIN_RESTAURANT_ID || 'rest-1');

    if (email && password) {
      if (password.length < 12) {
        console.error(
          '[seed] SEED_ADMIN_PASSWORD es demasiado corta (mínimo 12 caracteres). No se creó el usuario.'
        );
        return;
      }
      try {
        await this.createUser(
          rol === 'SUPERADMIN' ? 'Superadministrador' : 'Administrador',
          email, password, rol, restaurantId
        );
        console.log(`[seed] ${rol} inicial creado: ${email}`);
        console.log('[seed] Borra SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD y SEED_ADMIN_ROLE del entorno ahora que ya existe.');
      } catch (e) {
        console.log(`[seed] El usuario ${email} ya existía; no se hizo nada.`);
      }
      return;
    }

    if (esProduccion) {
      // Silencio deliberado: en producción no se crean usuarios solos.
      return;
    }

    try {
      await this.createUser('Admin Demo', 'admin@demo.com', 'admin123', 'ADMIN', 'rest-1');
      console.log('Usuario de demostración creado (solo en desarrollo): admin@demo.com / admin123');
    } catch (e) {
      console.log('Usuario de demostración ya existe (solo en desarrollo)');
    }
  }

  getUserRepository() {
    return this.userRepository;
  }

  async login(email: string, password: string) {
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      throw new Error('Invalid email or password');
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      throw new Error('Invalid email or password');
    }

    if (user.role !== 'SUPERADMIN' && user.restaurantId) {
      const restaurant = await prisma.restaurant.findUnique({ where: { id: user.restaurantId } });
      if (restaurant?.isBlocked) {
        throw new Error('La cuenta ha sido suspendida por falta de pago. Por favor contacte a soporte.');
      }
    }

    const token = jwt.sign(
      { 
        userId: user.id, 
        restaurantId: user.restaurantId, 
        email: user.email, 
        role: user.role 
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return {
      token,
      user: {
        id: user.id,
        restaurantId: user.restaurantId,
        name: user.name,
        email: user.email,
        role: user.role
      }
    };
  }

  async createUser(
    name: string, 
    email: string, 
    password: string, 
    role: UserRole, 
    restaurantId: string | null,
    lastName?: string,
    phone?: string,
    vehiclePlate?: string
  ): Promise<User> {
    const existingUser = await this.userRepository.findByEmail(email);
    if (existingUser) {
      throw new Error('Email is already registered');
    }

    const { randomUUID } = require('crypto');
    const passwordHash = await bcrypt.hash(password, 10);
    const newUser: User = {
      id: randomUUID(),
      restaurantId,
      name,
      lastName,
      email,
      phone,
      vehiclePlate,
      passwordHash,
      role,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    return await this.userRepository.save(newUser);
  }

  async updateUser(id: string, restaurantId: string, updates: { name?: string; email?: string; password?: string }): Promise<User> {
    const user = await this.userRepository.findById(id);
    if (!user || user.restaurantId !== restaurantId) {
      throw new Error('User not found');
    }

    if (updates.email && updates.email !== user.email) {
      const existingUser = await this.userRepository.findByEmail(updates.email);
      if (existingUser) {
        throw new Error('Email is already in use');
      }
      user.email = updates.email;
    }

    if (updates.name) {
      user.name = updates.name;
    }

    if (updates.password) {
      user.passwordHash = await bcrypt.hash(updates.password, 10);
    }

    user.updatedAt = new Date();
    return await this.userRepository.save(user);
  }

  // Cambio de contraseña propio, disponible para cualquier rol autenticado
  // (incluido SUPERADMIN, que no pertenece a ningún restaurante). A
  // diferencia de updateUser (pensado para que un ADMIN edite a su propio
  // personal), aquí no se compara restaurantId — el usuario solo puede
  // cambiar SU PROPIA contraseña, identificada por el id del token, y debe
  // confirmar la contraseña actual antes de poder cambiarla.
  async changeOwnPassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    const isCurrentValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      throw new Error('La contraseña actual no es correcta');
    }

    if (newPassword.length < 6) {
      throw new Error('La nueva contraseña debe tener al menos 6 caracteres');
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.updatedAt = new Date();
    await this.userRepository.save(user);
  }
}

// Singleton instance
export const authService = new AuthService();
