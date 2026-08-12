/**
 * catalogo-isolation.int-spec.ts — US-037 Phase 6 (6.1, 6.2).
 *
 * Cross-user isolation of the per-user classification catalog
 * (`Categoria`/`PatronClasificacion`), mirroring `auth-isolation.int-spec.ts`'s
 * style: two independently-created users, one seeded catalog each, then a
 * battery of "B's data never leaks into A's reads/writes" assertions.
 *
 * Covers CAT037-05 (RNF-SEC-006 isolation) end to end:
 *   - each user owns a disjoint 8+20-row catalog (structural row count +
 *     disjoint id sets)
 *   - `ICatalogoClasificacion.findAll(userId)` returns only the owner's rows
 *   - a per-user catalog edit on B never affects what A's `findAll` resolves
 *     (proves the read is a real per-user filter, not an in-memory slice of
 *     a shared read)
 *   - `IReclasificarCategoriaWriter.reasignar` persists the CALLER's own
 *     `Categoria` row id, never the other user's, even for the same nombre
 *   - the composite FK invariant confirmed by task 1.2 (D-06 primary
 *     branch): a raw cross-tenant INSERT is rejected at the database level,
 *     not just by application code
 *
 * Requires a real DB. Run via
 * `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration catalogo-isolation`.
 */
import 'dotenv/config';
import type { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { PrismaCatalogoClasificacionRepository } from '../src/infrastructure/persistence/prisma-catalogo-clasificacion.repository';
import { PrismaReclasificarCategoriaRepository } from '../src/infrastructure/persistence/prisma-reclasificar-categoria.repository';
import { crearCatalogoParaUsuario } from './support/catalogo.fixture';
import {
  CATEGORIA_TEMPLATE_SIZE,
  PATRON_TEMPLATE_SIZE,
} from '../src/infrastructure/persistence/catalogo-template';
import { Categoria } from '../src/domain/value-objects/categoria';
import { Bucket } from '../src/domain/value-objects/bucket';

const RUN_ID = `catalogo-isolation-int-${Date.now()}`;
const USER_ID_A = `cat-iso-a-${RUN_ID}`;
const USER_ID_B = `cat-iso-b-${RUN_ID}`;

describe('Catalog isolation (CAT037-05, CAT037-04) — per-user Categoria/PatronClasificacion', () => {
  let prisma: PrismaClient;
  let catalogoRepo: PrismaCatalogoClasificacionRepository;
  let reclasificarRepo: PrismaReclasificarCategoriaRepository;

  beforeAll(async () => {
    prisma = createPrismaClient(loadEnv());
    await prisma.$connect();
    catalogoRepo = new PrismaCatalogoClasificacionRepository(prisma);
    reclasificarRepo = new PrismaReclasificarCategoriaRepository(prisma);

    await prisma.user.create({
      data: { id: USER_ID_A, nombre: `Iso A ${RUN_ID}` },
    });
    await prisma.user.create({
      data: { id: USER_ID_B, nombre: `Iso B ${RUN_ID}` },
    });
    await crearCatalogoParaUsuario(prisma, USER_ID_A);
    await crearCatalogoParaUsuario(prisma, USER_ID_B);
  });

  afterAll(async () => {
    await prisma.transaccion.deleteMany({
      where: { account: { userId: { in: [USER_ID_A, USER_ID_B] } } },
    });
    await prisma.ingesta.deleteMany({
      where: { userId: { in: [USER_ID_A, USER_ID_B] } },
    });
    await prisma.account.deleteMany({
      where: { userId: { in: [USER_ID_A, USER_ID_B] } },
    });
    // Composite FK (PatronClasificacion.(categoriaId,userId) → Categoria) is
    // RESTRICT — clear the copied catalog before the owning users.
    await prisma.patronClasificacion.deleteMany({
      where: { userId: { in: [USER_ID_A, USER_ID_B] } },
    });
    await prisma.categoria.deleteMany({
      where: { userId: { in: [USER_ID_A, USER_ID_B] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [USER_ID_A, USER_ID_B] } },
    });
    await prisma.$disconnect();
  });

  it('each user owns a disjoint 8 Categoria + 20 PatronClasificacion catalog copy', async () => {
    const [catA, catB, patA, patB] = await Promise.all([
      prisma.categoria.findMany({ where: { userId: USER_ID_A } }),
      prisma.categoria.findMany({ where: { userId: USER_ID_B } }),
      prisma.patronClasificacion.findMany({ where: { userId: USER_ID_A } }),
      prisma.patronClasificacion.findMany({ where: { userId: USER_ID_B } }),
    ]);

    expect(catA).toHaveLength(CATEGORIA_TEMPLATE_SIZE);
    expect(catB).toHaveLength(CATEGORIA_TEMPLATE_SIZE);
    expect(patA).toHaveLength(PATRON_TEMPLATE_SIZE);
    expect(patB).toHaveLength(PATRON_TEMPLATE_SIZE);

    const idsA = new Set([...catA, ...patA].map((row) => row.id));
    const idsB = new Set([...catB, ...patB].map((row) => row.id));
    for (const id of idsA) {
      expect(idsB.has(id)).toBe(false);
    }
  });

  it("findAll(userId) returns only the owner's patterns — none of B's rows leak into A's read", async () => {
    const result = await catalogoRepo.findAll(USER_ID_A);
    expect(result.isOk()).toBe(true);
    const patronesA = result.getValue();
    expect(patronesA).toHaveLength(PATRON_TEMPLATE_SIZE);

    const idsB = new Set(
      (
        await prisma.patronClasificacion.findMany({
          where: { userId: USER_ID_B },
        })
      ).map((row) => row.id),
    );
    for (const patron of patronesA) {
      expect(idsB.has(patron.id)).toBe(false);
    }
  });

  it("A's descriptions never match B's patterns: editing B's catalog never changes what A's findAll resolves (CAT037-05)", async () => {
    // Repoint B's OWN "lider" pattern to a DIFFERENT category (B's own
    // Ahorro row) — if A's read were an in-memory filter over a shared
    // query instead of a structural `WHERE userId`, this edit would leak
    // into A's next findAll().
    const liderPatternB = await prisma.patronClasificacion.findFirstOrThrow({
      where: { userId: USER_ID_B, patron: 'lider' },
    });
    const ahorroCategoriaB = await prisma.categoria.findUniqueOrThrow({
      where: { userId_nombre: { userId: USER_ID_B, nombre: Categoria.Ahorro } },
    });
    await prisma.patronClasificacion.update({
      where: { id: liderPatternB.id },
      data: { categoriaId: ahorroCategoriaB.id },
    });

    const result = await catalogoRepo.findAll(USER_ID_A);
    const liderPatternA = result.getValue().find((p) => p.patron === 'lider');
    expect(liderPatternA?.categoria).toBe(Categoria.Supermercado);
  });

  it("B reclassifying a transaction writes B's OWN Categoria row id, never A's (CAT037-04)", async () => {
    const accountB = await prisma.account.create({
      data: {
        userId: USER_ID_B,
        banco: 'TestBank',
        tipoCuenta: 'CuentaCorriente',
        numeroCuenta: `iso-b-${RUN_ID}`,
      },
    });
    const ingestaB = await prisma.ingesta.create({
      data: {
        userId: USER_ID_B,
        accountId: accountB.id,
        banco: 'TestBank',
        nombreArchivo: `b-${RUN_ID}.xlsx`,
        estado: 'PROCESADA',
      },
    });
    const txB = await prisma.transaccion.create({
      data: {
        accountId: accountB.id,
        ingestaId: ingestaB.id,
        fecha: new Date('2026-07-15T00:00:00.000Z'),
        cargo: 5000n,
        abono: 0n,
        descripcion: 'Tx a reclasificar',
      },
    });

    const result = await reclasificarRepo.reasignar(
      USER_ID_B,
      txB.id,
      Categoria.Transporte,
      Bucket.Necesidades,
    );
    expect(result.isOk()).toBe(true);
    const { categoriaId } = result.getValue();

    const [transporteRowB, transporteRowA] = await Promise.all([
      prisma.categoria.findUniqueOrThrow({
        where: {
          userId_nombre: { userId: USER_ID_B, nombre: Categoria.Transporte },
        },
      }),
      prisma.categoria.findUniqueOrThrow({
        where: {
          userId_nombre: { userId: USER_ID_A, nombre: Categoria.Transporte },
        },
      }),
    ]);
    expect(categoriaId).toBe(transporteRowB.id);
    expect(categoriaId).not.toBe(transporteRowA.id);
  });

  // Task 1.2's outcome: composite FK CONFIRMED present (D-06 primary
  // branch) — a raw cross-tenant INSERT must be rejected by
  // "PatronClasificacion_categoriaId_userId_fkey", not merely by
  // application-level code paths.
  it("invariant (D-06 composite FK): a raw INSERT of a pattern with A's categoriaId + B's userId is rejected by the FK", async () => {
    const categoriaRowA = await prisma.categoria.findFirstOrThrow({
      where: { userId: USER_ID_A },
    });

    await expect(
      prisma.$executeRaw`INSERT INTO "PatronClasificacion" (id, patron, "matchType", "categoriaId", "userId", prioridad)
        VALUES (${`bad-cross-tenant-${RUN_ID}`}, ${'cross-tenant-probe'}, ${'CONTAINS'}, ${categoriaRowA.id}, ${USER_ID_B}, ${999})`,
    ).rejects.toThrow();
  });
});
