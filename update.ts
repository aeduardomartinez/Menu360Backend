import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.restaurant.updateMany({
    where: { slug: 'demo' },
    data: { slug: 'restaurantepacheco.com' }
  });
  console.log('Updated:', result);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
