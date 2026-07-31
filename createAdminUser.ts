import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  let restaurant = await prisma.restaurant.findFirst();
  
  if (!restaurant) {
    console.log("No restaurant found. Creating a default one...");
    restaurant = await prisma.restaurant.create({
      data: {
        slug: 'default-restaurant',
        name: 'Default Restaurant',
        themeColor: '#000000',
      }
    });
  }

  const email = 'admin@gmail.com';
  const passwordHash = await bcrypt.hash('123', 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      role: 'ADMIN',
    },
    create: {
      restaurantId: restaurant.id,
      name: 'Admin',
      email,
      passwordHash,
      role: 'ADMIN',
    },
  });

  console.log('Admin user created/updated:', user.email);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
