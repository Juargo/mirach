import 'dotenv/config';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { runSeed, PATRON_CATALOG_SIZE } from '../prisma/seed';
import {
  USER_ID_FIJO,
  ACCOUNT_ID_FIJO,
} from '../src/infrastructure/persistence/constants';
import { CATEGORIA_TEMPLATE_SIZE } from '../src/infrastructure/persistence/catalogo-template';

describe('seed idempotency integration (real dev DB)', () => {
  const prisma = createPrismaClient(loadEnv());

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
    expect(await prisma.account.count({ where: { id: ACCOUNT_ID_FIJO } })).toBe(
      1,
    );
  });

  // T20 — seed idempotency: exactamente 5 BucketPresupuesto, sin duplicados
  it('produce exactamente 5 BucketPresupuesto (sin duplicados)', async () => {
    expect(await prisma.bucketPresupuesto.count()).toBe(5);
  });

  it('no crea PatronClasificacion duplicados', async () => {
    expect(await prisma.patronClasificacion.count()).toBe(PATRON_CATALOG_SIZE);
  });

  // CAT037-02: seed run twice ⇒ 8+20 rows, ids stable, all owned by
  // USER_ID_FIJO, no duplicates.
  it('produce exactamente 8 Categoria propias de USER_ID_FIJO, sin nombres duplicados', async () => {
    const categorias = await prisma.categoria.findMany({
      where: { userId: USER_ID_FIJO },
    });
    expect(categorias).toHaveLength(CATEGORIA_TEMPLATE_SIZE);
    const nombres = categorias.map((categoria) => categoria.nombre);
    expect(new Set(nombres).size).toBe(nombres.length);
  });

  it('todas las filas de PatronClasificacion quedan owned por USER_ID_FIJO', async () => {
    const patrones = await prisma.patronClasificacion.findMany();
    expect(patrones.every((patron) => patron.userId === USER_ID_FIJO)).toBe(
      true,
    );
  });

  it('correr el seed una tercera vez no mueve los ids de Categoria/PatronClasificacion (upsert por id fijo)', async () => {
    const categoriasAntes = await prisma.categoria.findMany({
      where: { userId: USER_ID_FIJO },
      orderBy: { nombre: 'asc' },
    });
    const patronesAntes = await prisma.patronClasificacion.findMany({
      orderBy: { patron: 'asc' },
    });

    await runSeed(prisma);

    const categoriasDespues = await prisma.categoria.findMany({
      where: { userId: USER_ID_FIJO },
      orderBy: { nombre: 'asc' },
    });
    const patronesDespues = await prisma.patronClasificacion.findMany({
      orderBy: { patron: 'asc' },
    });

    expect(categoriasDespues.map((c) => c.id)).toEqual(
      categoriasAntes.map((c) => c.id),
    );
    expect(patronesDespues.map((p) => p.id)).toEqual(
      patronesAntes.map((p) => p.id),
    );
    expect(categoriasDespues).toHaveLength(CATEGORIA_TEMPLATE_SIZE);
    expect(patronesDespues).toHaveLength(PATRON_CATALOG_SIZE);
  });
});
