import 'dotenv/config';
import { PrismaService } from '../src/infrastructure/persistence/prisma.service';
import { runSeed, PATRON_CATALOG_SIZE } from '../prisma/seed';
import {
  USER_ID_FIJO,
  ACCOUNT_ID_FIJO,
} from '../src/infrastructure/persistence/constants';

describe('seed idempotency integration (real dev DB)', () => {
  const prisma = new PrismaService();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    // NO borramos la identidad canónica (USER_ID_FIJO/ACCOUNT_ID_FIJO): es el
    // estado semilla intencional de la BD de desarrollo compartida, y borrarla
    // dispararía errores FK-RESTRICT si hay filas dependientes.
    await prisma.$disconnect();
  });

  it('correr el seed dos veces no crea duplicados (mismo User/Account fijo)', async () => {
    // Idempotencia por upsert: el conteo es 1 exista o no previamente.
    await runSeed(prisma);
    await runSeed(prisma);

    expect(await prisma.user.count({ where: { id: USER_ID_FIJO } })).toBe(1);
    expect(await prisma.account.count({ where: { id: ACCOUNT_ID_FIJO } })).toBe(1);
  });

  // T20 — seed idempotency: exactly 5 BucketPresupuesto rows, no dup PatronClasificacion
  it('correr el seed dos veces produce exactamente 5 BucketPresupuesto (sin duplicados)', async () => {
    await runSeed(prisma);
    await runSeed(prisma);

    const bucketCount = await prisma.bucketPresupuesto.count();
    expect(bucketCount).toBe(5);
  });

  it('correr el seed dos veces no crea PatronClasificacion duplicados', async () => {
    await runSeed(prisma);
    const countAfterFirst = await prisma.patronClasificacion.count();

    await runSeed(prisma);
    const countAfterSecond = await prisma.patronClasificacion.count();

    expect(countAfterFirst).toBe(countAfterSecond);
    expect(countAfterSecond).toBe(PATRON_CATALOG_SIZE);
  });
});
