// create-superadmin.ts
//
// Recrea la cuenta SUPERADMIN (andres.martinez@gmail.com) que se perdió con
// el reset accidental de la base de datos del 2026-09-14. Un SUPERADMIN no
// pertenece a ningún restaurante (restaurantId = null) y es quien puede
// crear/administrar los negocios desde el panel de SuperAdmin.
//
// USO (una sola vez, desde la carpeta backend):
//   npx ts-node scripts/create-superadmin.ts
//
// Es seguro volver a correrlo: si el email ya existe, solo actualiza la
// contraseña y el rol en vez de duplicar la cuenta.
//
// IMPORTANTE: este script NO toca el esquema ni corre ninguna migración —
// solo inserta/actualiza una fila en la tabla User. No hay riesgo de que
// borre datos existentes.

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const SUPERADMIN_EMAIL = 'andres.martinez@gmail.com';
const SUPERADMIN_PASSWORD = 'CambiaEstaClave2026!'; // Cámbiala desde tu perfil apenas inicies sesión.
const SUPERADMIN_NAME = 'Andrés Martínez';

async function main() {
  const passwordHash = await bcrypt.hash(SUPERADMIN_PASSWORD, 10);

  const user = await prisma.user.upsert({
    where: { email: SUPERADMIN_EMAIL },
    update: {
      role: 'SUPERADMIN',
      restaurantId: null,
      passwordHash,
    },
    create: {
      email: SUPERADMIN_EMAIL,
      name: SUPERADMIN_NAME,
      role: 'SUPERADMIN',
      restaurantId: null,
      passwordHash,
    },
  });

  console.log('Cuenta SUPERADMIN lista:');
  console.log('  Email:    ', user.email);
  console.log('  Password: ', SUPERADMIN_PASSWORD, '(cámbiala apenas inicies sesión, desde tu perfil)');
}

main()
  .catch((e) => {
    console.error('Error creando la cuenta SUPERADMIN:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
