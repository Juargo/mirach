/**
 * catalogo-crud.int-spec.ts — US-038 (Phase 12.2/12.3).
 *
 * HTTP-level round trip against the real `/api/categorias` +
 * `/api/patrones` surface: create → list → rename → re-bucket → delete,
 * plus the case-insensitive uniqueness rules and their sharpest edge case
 * (the ILIKE wildcard false-positive, design.md §5.2 MUST-VERIFY).
 *
 * Requires a real DB. Run via
 * `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration catalogo-crud`.
 */
import 'dotenv/config';
import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../src/infrastructure/http-express/app';
import { createContainer } from '../src/composition/container';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { crearSesionParaUsuario } from './support/session.fixture';

const ALLOW = process.env.ALLOW_DESTRUCTIVE_DB === '1';
const API_KEY = process.env.API_KEY ?? '';

const RUN_ID = `catalogo-crud-int-${Date.now()}`;
const USER_ID = `cat-crud-${RUN_ID}`;
// `nombre` is capped at 40 chars (NombreCategoriaInvalidoError) — RUN_ID
// alone is already ~30 chars, so category names use this SHORT suffix
// instead (base36 timestamp, still unique enough for one test run).
const SHORT = Date.now().toString(36);

describe('Catalog CRUD (integration) — /api/categorias + /api/patrones (US-038)', () => {
  let app: Express;
  let prisma: PrismaClient;
  let auth: string;

  beforeAll(async () => {
    if (!ALLOW) return;

    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();
    app = createApp(createContainer(env, prisma), env);

    await prisma.user.create({
      data: { id: USER_ID, nombre: `Catalogo CRUD ${RUN_ID}` },
    });
    const { token } = await crearSesionParaUsuario(prisma, USER_ID);
    auth = `Bearer ${token}`;
  });

  afterAll(async () => {
    if (!ALLOW) return;

    await prisma.transaccion.deleteMany({
      where: { account: { userId: USER_ID } },
    });
    await prisma.ingesta.deleteMany({ where: { userId: USER_ID } });
    await prisma.account.deleteMany({ where: { userId: USER_ID } });
    await prisma.patronClasificacion.deleteMany({ where: { userId: USER_ID } });
    await prisma.categoria.deleteMany({ where: { userId: USER_ID } });
    await prisma.session.deleteMany({ where: { userId: USER_ID } });
    await prisma.user.deleteMany({ where: { id: USER_ID } });
    await prisma.$disconnect();
  });

  // ---------------------------------------------------------------------
  // §5.2 MUST-VERIFY — the ILIKE wildcard decision gate. Run EARLY: its
  // outcome (documented in the PR body) selects between the SQL
  // case-insensitive comparison already shipped in PrismaCategoriaRepository
  // and a trigger-gated in-memory fallback if this test fails.
  //
  // RESULT (recorded 2026-08-12, run against the local ephemeral Postgres):
  // PASSED — Prisma's `mode: 'insensitive'` `equals` comparison treats "_"
  // as a LITERAL character here, not an ILIKE wildcard (Prisma does not
  // compile `equals`+`insensitive` to a raw `ILIKE '<value>'` on Postgres;
  // it parameterizes through a citext-style comparison). No fallback
  // needed — PrismaCategoriaRepository's SQL comparison stands as shipped.
  // ---------------------------------------------------------------------
  it('§5.2 GATE: a name containing "_" (a_b) does NOT false-positive-block an unrelated name (axb) — ILIKE wildcard escaping', async () => {
    if (!ALLOW) return;

    // Literal pair scoped to this run: "a_b-<suffix>" then "axb-<suffix>".
    // If Prisma's `mode: 'insensitive'` compiled to an unescaped ILIKE, the
    // literal "_" in the first name would match ANY character, so the
    // second create would wrongly collide and 409.
    await request(app)
      .post('/api/categorias')
      .set('x-api-key', API_KEY)
      .set('Authorization', auth)
      .send({ nombre: `a_b-${SHORT}`, bucket: 'Deseos' })
      .expect(201);

    const second = await request(app)
      .post('/api/categorias')
      .set('x-api-key', API_KEY)
      .set('Authorization', auth)
      .send({ nombre: `axb-${SHORT}`, bucket: 'Deseos' });

    expect(second.status).not.toBe(409);
  });

  it('create → list → rename → re-bucket → delete round trip', async () => {
    if (!ALLOW) return;

    const created = await request(app)
      .post('/api/categorias')
      .set('x-api-key', API_KEY)
      .set('Authorization', auth)
      .send({ nombre: `Mascotas-${SHORT}`, bucket: 'Deseos' })
      .expect(201);

    expect(created.body.patrones).toEqual([]); // CA-03

    const listed = await request(app)
      .get('/api/categorias')
      .set('x-api-key', API_KEY)
      .set('Authorization', auth)
      .expect(200);
    expect(
      listed.body.categorias.some(
        (c: { id: string }) => c.id === created.body.id,
      ),
    ).toBe(true);

    const renamed = await request(app)
      .patch(`/api/categorias/${created.body.id}`)
      .set('x-api-key', API_KEY)
      .set('Authorization', auth)
      .send({ nombre: `Renombrada-${SHORT}` })
      .expect(200);
    expect(renamed.body.nombre).toBe(`Renombrada-${SHORT}`);
    expect(renamed.body.bucket).toBe('Deseos');

    const rebucketed = await request(app)
      .patch(`/api/categorias/${created.body.id}`)
      .set('x-api-key', API_KEY)
      .set('Authorization', auth)
      .send({ bucket: 'Necesidades' })
      .expect(200);
    expect(rebucketed.body.bucket).toBe('Necesidades');

    await request(app)
      .delete(`/api/categorias/${created.body.id}`)
      .set('x-api-key', API_KEY)
      .set('Authorization', auth)
      .expect(204);

    const afterDelete = await prisma.categoria.findUnique({
      where: { id: created.body.id },
    });
    expect(afterDelete).toBeNull();
  });

  it('delete with patterns and no transactions → 204, category AND its patterns are gone', async () => {
    if (!ALLOW) return;

    const categoria = await request(app)
      .post('/api/categorias')
      .set('x-api-key', API_KEY)
      .set('Authorization', auth)
      .send({ nombre: `ConPatrones-${SHORT}`, bucket: 'Ahorro' })
      .expect(201);

    const patron = await request(app)
      .post('/api/patrones')
      .set('x-api-key', API_KEY)
      .set('Authorization', auth)
      .send({
        categoriaId: categoria.body.id,
        patron: `p-${RUN_ID}`,
        matchType: 'CONTAINS',
      })
      .expect(201);

    await request(app)
      .delete(`/api/categorias/${categoria.body.id}`)
      .set('x-api-key', API_KEY)
      .set('Authorization', auth)
      .expect(204);

    const categoriaRow = await prisma.categoria.findUnique({
      where: { id: categoria.body.id },
    });
    const patronRow = await prisma.patronClasificacion.findUnique({
      where: { id: patron.body.id },
    });
    expect(categoriaRow).toBeNull();
    expect(patronRow).toBeNull();
  });

  it('delete-in-use → 409, and NOTHING was deleted — the category and its patterns survive', async () => {
    if (!ALLOW) return;

    const categoria = await request(app)
      .post('/api/categorias')
      .set('x-api-key', API_KEY)
      .set('Authorization', auth)
      .send({ nombre: `EnUso-${SHORT}`, bucket: 'Necesidades' })
      .expect(201);

    const patron = await request(app)
      .post('/api/patrones')
      .set('x-api-key', API_KEY)
      .set('Authorization', auth)
      .send({
        categoriaId: categoria.body.id,
        patron: `enuso-${RUN_ID}`,
        matchType: 'CONTAINS',
      })
      .expect(201);

    const account = await prisma.account.create({
      data: {
        userId: USER_ID,
        banco: 'TestBank',
        tipoCuenta: 'CuentaCorriente',
        numeroCuenta: `en-uso-${RUN_ID}`,
      },
    });
    const ingesta = await prisma.ingesta.create({
      data: {
        userId: USER_ID,
        accountId: account.id,
        banco: 'TestBank',
        nombreArchivo: `en-uso-${RUN_ID}.xlsx`,
        estado: 'PROCESADA',
      },
    });
    await prisma.transaccion.create({
      data: {
        accountId: account.id,
        ingestaId: ingesta.id,
        fecha: new Date('2026-07-01T00:00:00.000Z'),
        cargo: 1000n,
        abono: 0n,
        descripcion: 'Tx en uso',
        categoriaId: categoria.body.id,
      },
    });

    const res = await request(app)
      .delete(`/api/categorias/${categoria.body.id}`)
      .set('x-api-key', API_KEY)
      .set('Authorization', auth)
      .expect(409);
    expect(res.body.code).toBe('CATEGORIA_EN_USO');

    const categoriaRow = await prisma.categoria.findUnique({
      where: { id: categoria.body.id },
    });
    const patronRow = await prisma.patronClasificacion.findUnique({
      where: { id: patron.body.id },
    });
    expect(categoriaRow).not.toBeNull();
    expect(patronRow).not.toBeNull();
  });

  it('case-insensitive duplicate category name → 409', async () => {
    if (!ALLOW) return;

    await request(app)
      .post('/api/categorias')
      .set('x-api-key', API_KEY)
      .set('Authorization', auth)
      .send({ nombre: `Duplicada-${SHORT}`, bucket: 'Ahorro' })
      .expect(201);

    const res = await request(app)
      .post('/api/categorias')
      .set('x-api-key', API_KEY)
      .set('Authorization', auth)
      .send({ nombre: `duplicada-${SHORT}`.toUpperCase(), bucket: 'Ahorro' })
      .expect(409);
    expect(res.body.code).toBe('NOMBRE_DUPLICADO');
  });
});
