import 'dotenv/config';
import { PrismaService } from '../src/infrastructure/persistence/prisma.service';
import { runSeed, PATRON_CATALOG_SIZE } from '../prisma/seed';
import {
  USER_ID_FIJO,
  ACCOUNT_ID_FIJO,
} from '../src/infrastructure/persistence/constants';

describe('seed idempotency integration (real dev DB)', () => {
  const prisma = new PrismaService();

  // Se siembra DOS veces una sola vez para TODA la suite y luego cada test
  // asserta sobre el estado ya doble-sembrado. Antes cada test corría el seed
  // dos veces (6 corridas en total), lo que hacía timeout intermitente a 30s.
  // Dos corridas bastan para probar la idempotencia por upsert.
  beforeAll(async () => {
    await prisma.$connect();
    await runSeed(prisma);
    await runSeed(prisma);
  }, 90000);

  afterAll(async () => {
    // NO borramos la identidad canónica (USER_ID_FIJO/ACCOUNT_ID_FIJO): es el
    // estado semilla intencional de la BD de desarrollo compartida, y borrarla
    // dispararía errores FK-RESTRICT si hay filas dependientes.
    await prisma.$disconnect();
  });

  it('el seed no duplica User/Account fijos (upsert idempotente)', async () => {
    expect(await prisma.user.count({ where: { id: USER_ID_FIJO } })).toBe(1);
    expect(await prisma.account.count({ where: { id: ACCOUNT_ID_FIJO } })).toBe(1);
  });

  // T20 — seed idempotency: exactamente 5 BucketPresupuesto, sin duplicados
  it('produce exactamente 5 BucketPresupuesto (sin duplicados)', async () => {
    expect(await prisma.bucketPresupuesto.count()).toBe(5);
  });

  it('no crea PatronClasificacion duplicados', async () => {
    expect(await prisma.patronClasificacion.count()).toBe(PATRON_CATALOG_SIZE);
  });
});
