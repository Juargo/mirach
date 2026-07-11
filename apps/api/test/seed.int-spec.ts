import 'dotenv/config';
import { PrismaService } from '../src/infrastructure/persistence/prisma.service';
import { runSeed } from '../prisma/seed';
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
});
