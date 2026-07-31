import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 1. Create Demo Restaurant
  const restaurant = await prisma.restaurant.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      id: 'rest-1',
      slug: 'demo',
      name: 'Restaurante Demo',
      themeColor: '#f43f5e',
    },
  });

  // 2. Create Admin User
  const adminEmail = 'admin@demo.com';
  const adminPassword = await bcrypt.hash('admin123', 10);
  
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      id: 'admin-1',
      restaurantId: restaurant.id,
      name: 'Administrador',
      email: adminEmail,
      passwordHash: adminPassword,
      role: 'ADMIN',
    },
  });

  // 3. Create initial box
  await prisma.box.create({
    data: {
      id: 'box-1',
      restaurantId: restaurant.id,
      name: 'Caja Principal',
      description: 'Caja Demo',
      status: 'CLOSED',
      currentBalance: 0,
      assignedUserId: 'admin-1',
    }
  });

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
