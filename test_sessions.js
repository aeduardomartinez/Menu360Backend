const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkSessions() {
  const sessions = await prisma.boxSession.findMany();
  console.log('Sessions count:', sessions.length);
  if (sessions.length > 0) {
    console.log(sessions);
  }
}

checkSessions().catch(console.error).finally(() => prisma.$disconnect());
