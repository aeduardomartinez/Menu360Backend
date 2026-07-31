const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const email = 'andres.martinez@gmail.com';
  const passwordHash = await bcrypt.hash('123', 10);
  
  const existingUser = await prisma.user.findUnique({ where: { email } });
  
  if (existingUser) {
    console.log('El usuario ya existe, actualizando su rol y contraseña a SUPERADMIN...');
    await prisma.user.update({
      where: { email },
      data: { 
        role: 'SUPERADMIN',
        passwordHash,
        restaurantId: null
      }
    });
    console.log('Usuario actualizado exitosamente.');
  } else {
    console.log('Creando nuevo usuario SUPERADMIN...');
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: 'SUPERADMIN',
        name: 'Andres Martinez',
      }
    });
    console.log('Usuario SUPERADMIN creado exitosamente.');
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
