import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { join } from 'path';
import { createApp } from '../src/infrastructure/http-express/app';
import { createContainer } from '../src/composition/container';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { loginAsSeededUser, type Sesion } from './support/login.e2e-helper';

const API_KEY = process.env.API_KEY ?? '';

/**
 * E2E de POST /api/ingestas/preview (US-003, Slice 1) contra una BD real de
 * desarrollo (localhost, ADR-029).
 *
 * A diferencia de `ingesta.e2e-spec.ts`/`ingesta-pdf.e2e-spec.ts`, este
 * archivo NO necesita `createdIngestaIds`/`afterAll` cleanup: la premisa
 * entera de la ruta (CA-04, PREV-02) es que NINGUNA fila se crea, ni en
 * éxito ni en fallo. La forma de probarlo es contar filas antes/después en
 * vez de limpiar filas creadas.
 */
describe('IngestaController (e2e) — POST /api/ingestas/preview', () => {
  let app: Express;
  let prisma: PrismaClient;
  let sesion: Sesion;

  const fixturesDir = join(__dirname, 'fixtures');
  const xlsxFixture = join(fixturesDir, 'movimientos-test.xlsx');
  const pdfFixture = join(fixturesDir, 'pdf', 'bancochile-cartola-test.pdf');
  const xlsFixture = join(fixturesDir, 'cartola-test.xls');

  beforeEach(async () => {
    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();
    app = createApp(createContainer(env, prisma), env);
    sesion = await loginAsSeededUser(app);
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  it('acepta un .xlsx válido y retorna el PreviewIngestaDto canónico (T1.10)', async () => {
    const response = await request(app)
      .post('/api/ingestas/preview')
      .set('x-api-key', API_KEY)
      .set('Cookie', sesion.cookie)
      .attach('file', xlsxFixture, 'movimientos-preview.xlsx')
      .expect(200);

    expect(response.body.banco).toBe('BCI');
    expect(typeof response.body.tipoCuenta).toBe('string');
    expect(typeof response.body.numeroCuenta).toBe('string');
    // --- CANONICAL shape (US-057): resumen + filas (full set) ---
    expect(response.body.resumen.totalFilas).toEqual(expect.any(Number));
    expect(response.body.resumen.totalFilas).toBeGreaterThan(0);
    for (const tx of response.body.filas) {
      expect(typeof tx.cargo).toBe('string');
      expect(typeof tx.abono).toBe('string');
      expect(typeof tx.fecha).toBe('string');
      expect(typeof tx.descripcion).toBe('string');
      expect(typeof tx.rowIndex).toBe('number');
      expect(typeof tx.esDuplicado).toBe('boolean');
      expect(
        tx.sugerido === null ||
          (typeof tx.sugerido === 'object' && tx.sugerido !== null),
      ).toBe(true);
    }
    // --- LEGACY shape (@deprecated compat shim, removed by US-061): must be
    //     present and consistent with the canonical shape ---
    expect(response.body.estructura.totalFilasDatos).toBe(
      response.body.resumen.totalFilas,
    );
    expect(response.body.muestra.length).toBeLessThanOrEqual(50);
    expect(response.body.muestra.length).toBe(
      Math.min(50, response.body.filas.length),
    );
    for (const fila of response.body.muestra) {
      // Legacy rows carry ONLY the four original fields — no new fields.
      expect(Object.keys(fila).sort()).toEqual([
        'abono',
        'cargo',
        'descripcion',
        'fecha',
      ]);
      expect(typeof fila.cargo).toBe('string');
      expect(typeof fila.abono).toBe('string');
    }
  });

  it('acepta un .pdf válido y retorna la misma forma canónica que el .xlsx (T1.10)', async () => {
    const response = await request(app)
      .post('/api/ingestas/preview')
      .set('x-api-key', API_KEY)
      .set('Cookie', sesion.cookie)
      .attach('file', pdfFixture, 'cartola-preview.pdf')
      .expect(200);

    expect(response.body.banco).toBe('Banco de Chile');
    // --- CANONICAL shape (US-057) ---
    expect(response.body.resumen.totalFilas).toBeGreaterThan(0);
    for (const tx of response.body.filas) {
      expect(typeof tx.cargo).toBe('string');
      expect(typeof tx.abono).toBe('string');
      expect(typeof tx.rowIndex).toBe('number');
      expect(typeof tx.esDuplicado).toBe('boolean');
      expect(
        tx.sugerido === null ||
          (typeof tx.sugerido === 'object' && tx.sugerido !== null),
      ).toBe(true);
    }
    // --- LEGACY shape (@deprecated compat shim, removed by US-061) ---
    expect(response.body.estructura.totalFilasDatos).toBe(
      response.body.resumen.totalFilas,
    );
    expect(response.body.muestra.length).toBeLessThanOrEqual(50);
    for (const fila of response.body.muestra) {
      expect(Object.keys(fila).sort()).toEqual([
        'abono',
        'cargo',
        'descripcion',
        'fecha',
      ]);
      expect(typeof fila.cargo).toBe('string');
      expect(typeof fila.abono).toBe('string');
    }
  });

  it('rechaza un .xls con 400 (falla en IngestFile, sin llegar a detectar banco)', async () => {
    const response = await request(app)
      .post('/api/ingestas/preview')
      .set('x-api-key', API_KEY)
      .set('Cookie', sesion.cookie)
      .attach('file', xlsFixture)
      .expect(400);

    expect(response.body.message).toMatch(/\.xls/i);
  });

  it('retorna 400 cuando no se envía archivo', async () => {
    const response = await request(app)
      .post('/api/ingestas/preview')
      .set('x-api-key', API_KEY)
      .set('Cookie', sesion.cookie)
      .expect(400);

    expect(response.body.message).toMatch(/archivo/i);
  });

  // --- PREV-02 / CA-04: la garantía estructural, probada de punta a punta ---
  describe('CA-04 — preview no persiste NADA (PREV-02)', () => {
    it('un preview exitoso (.xlsx) no crea ninguna fila Account/Ingesta/Transaccion', async () => {
      const antesAccounts = await prisma.account.count();
      const antesIngestas = await prisma.ingesta.count();
      const antesTransacciones = await prisma.transaccion.count();

      await request(app)
        .post('/api/ingestas/preview')
        .set('x-api-key', API_KEY)
        .set('Cookie', sesion.cookie)
        .attach('file', xlsxFixture, 'movimientos-ca04.xlsx')
        .expect(200);

      expect(await prisma.account.count()).toBe(antesAccounts);
      expect(await prisma.ingesta.count()).toBe(antesIngestas);
      expect(await prisma.transaccion.count()).toBe(antesTransacciones);
    });

    it('un preview exitoso (.pdf) no crea ninguna fila Account/Ingesta/Transaccion', async () => {
      const antesAccounts = await prisma.account.count();
      const antesIngestas = await prisma.ingesta.count();
      const antesTransacciones = await prisma.transaccion.count();

      await request(app)
        .post('/api/ingestas/preview')
        .set('x-api-key', API_KEY)
        .set('Cookie', sesion.cookie)
        .attach('file', pdfFixture, 'cartola-ca04.pdf')
        .expect(200);

      expect(await prisma.account.count()).toBe(antesAccounts);
      expect(await prisma.ingesta.count()).toBe(antesIngestas);
      expect(await prisma.transaccion.count()).toBe(antesTransacciones);
    });

    it('un preview fallido (estructura inválida) tampoco crea ninguna fila', async () => {
      const antesIngestas = await prisma.ingesta.count();

      await request(app)
        .post('/api/ingestas/preview')
        .set('x-api-key', API_KEY)
        .set('Cookie', sesion.cookie)
        .attach('file', xlsFixture)
        .expect(400);

      expect(await prisma.ingesta.count()).toBe(antesIngestas);
    });

    it('tres previews consecutivos del mismo archivo no acumulan filas', async () => {
      const antesAccounts = await prisma.account.count();
      const antesIngestas = await prisma.ingesta.count();
      const antesTransacciones = await prisma.transaccion.count();

      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/ingestas/preview')
          .set('x-api-key', API_KEY)
          .set('Cookie', sesion.cookie)
          .attach('file', xlsxFixture, `movimientos-repetido-${i}.xlsx`)
          .expect(200);
      }

      expect(await prisma.account.count()).toBe(antesAccounts);
      expect(await prisma.ingesta.count()).toBe(antesIngestas);
      expect(await prisma.transaccion.count()).toBe(antesTransacciones);
    });
  });
});
