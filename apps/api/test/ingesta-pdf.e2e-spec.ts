import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { join } from 'path';
import { createApp } from '../src/infrastructure/http-express/app';
import { createContainer } from '../src/composition/container';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';

const RUN_ID = `e2e-pdf-${Date.now()}`;
const API_KEY = process.env.API_KEY ?? '';

/**
 * E2E de POST /api/ingestas para archivos `.pdf` (Sprint 4, sprint4-pdf-ingesta,
 * Phase 6/PR5, spec.md PDF-04) — mirror de `test/ingesta.e2e-spec.ts` (US-011,
 * PR4), separado en su propio archivo porque cubre el trio PDF (no el Excel).
 *
 * Corre el pipeline HTTP completo vía ProcessIngestaUseCase — el mismo
 * orquestador que usa el CLI —, así que estos tests PERSISTEN filas reales.
 * Requiere ALLOW_DESTRUCTIVE_DB=1 (gate compartido con test:integration, ver
 * test/integration.setup.ts); `pnpm api test:e2e` ya lo exporta. Cada test
 * limpia sus propias filas (Ingesta/Transaccion) en afterAll.
 */
describe('IngestaController (e2e) — POST /api/ingestas con .pdf', () => {
  let app: Express;
  let prisma: PrismaClient;

  const fixturesDir = join(__dirname, 'fixtures', 'pdf');
  const pdfFixture = join(fixturesDir, 'santander-cartola-test.pdf');
  const noBancoPdfFixture = join(fixturesDir, 'no-banco-test.pdf');

  const createdIngestaIds: string[] = [];

  beforeEach(async () => {
    prisma = createPrismaClient();
    await prisma.$connect();
    app = createApp(createContainer(prisma));
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  afterAll(async () => {
    if (createdIngestaIds.length === 0) return;
    const cleanupPrisma = createPrismaClient();
    await cleanupPrisma.$connect();
    await cleanupPrisma.transaccion.deleteMany({
      where: { ingestaId: { in: createdIngestaIds } },
    });
    await cleanupPrisma.ingesta.deleteMany({
      where: { id: { in: createdIngestaIds } },
    });
    await cleanupPrisma.$disconnect();
  });

  it('acepta un archivo .pdf bancario válido, lo persiste vía ProcessIngestaUseCase y retorna el contrato HTTP completo (PDF-04 escenario 1)', async () => {
    const nombreArchivo = `cartola-${RUN_ID}-ok.pdf`;

    const response = await request(app)
      .post('/api/ingestas')
      .set('x-api-key', API_KEY)
      .attach('file', pdfFixture, nombreArchivo)
      .expect(200);

    // Registrar ANTES de cualquier expect(): un assertion fallido más abajo
    // no debe dejar la fila huérfana en la BD compartida de desarrollo.
    createdIngestaIds.push(response.body.ingestaId);

    expect(typeof response.body.ingestaId).toBe('string');
    expect(response.body.ingestaId.length).toBeGreaterThan(0);
    expect(response.body.banco).toBe('Santander');
    expect(response.body.archivo).toEqual({
      nombre: nombreArchivo,
      extension: '.pdf',
      tamanoBytes: expect.any(Number),
    });
    expect(response.body.totalTransacciones).toBe(
      response.body.transacciones.length,
    );
    expect(response.body.transacciones.length).toBeGreaterThan(0);
    // cargo/abono viajan como STRING — JSON no serializa BigInt nativamente.
    for (const tx of response.body.transacciones) {
      expect(typeof tx.cargo).toBe('string');
      expect(typeof tx.abono).toBe('string');
      expect(typeof tx.fecha).toBe('string');
      expect(typeof tx.descripcion).toBe('string');
    }

    // La fila realmente quedó PROCESADA en la BD (no solo en la respuesta),
    // y bajo el userId/accountId correcto (RNF-SEC-006).
    const ingesta = await prisma.ingesta.findUnique({
      where: { id: response.body.ingestaId },
    });
    expect(ingesta?.estado).toBe('PROCESADA');
    expect(ingesta?.accountId).toBeTruthy();

    const filas = await prisma.transaccion.findMany({
      where: { ingestaId: response.body.ingestaId },
    });
    expect(filas).toHaveLength(response.body.transacciones.length);
  });

  it('rechaza un PDF > 10 MB con 400 antes de parsear (PDF-00 escenario "oversized PDF")', async () => {
    // Mismo mecanismo que el .xlsx (UploadTooLargeFilter, FileInterceptor
    // limits.fileSize) — no depende de la extensión. Reutilizamos un buffer
    // sintético > 10 MB en vez de un fixture real de ese tamaño en el repo.
    const buffer = Buffer.alloc(10 * 1024 * 1024 + 1, 0);

    const response = await request(app)
      .post('/api/ingestas')
      .set('x-api-key', API_KEY)
      .attach('file', buffer, 'cartola-gigante.pdf')
      .expect(400);

    expect(response.body).toBeDefined();
  });

  it('un PDF sin ninguno de los 4 anclas de banco falla con error controlado, sin filtrar texto crudo (PDF-04 escenario "non-bank PDF")', async () => {
    const nombreArchivo = `no-banco-${RUN_ID}.pdf`;

    const response = await request(app)
      .post('/api/ingestas')
      .set('x-api-key', API_KEY)
      .attach('file', noBancoPdfFixture, nombreArchivo)
      .expect(400);

    expect(typeof response.body.message).toBe('string');
    // No debe filtrar el texto/nombre de archivo crudo del PDF de contenido
    // (BancoNoReconocidoError SÍ interpola el originalName subido por el
    // cliente — no es texto extraído del PDF — mismo contrato que el .xlsx).
    expect(response.body.message).not.toMatch(/RUT|rut\s*:/i);
  });

  it('no dejó ninguna fila huérfana para el PDF no reconocido (nada que limpiar, la ingesta nunca se creó)', async () => {
    const antes = await prisma.ingesta.count();
    await request(app)
      .post('/api/ingestas')
      .set('x-api-key', API_KEY)
      .attach('file', noBancoPdfFixture, `no-banco-${RUN_ID}-2.pdf`)
      .expect(400);
    const despues = await prisma.ingesta.count();
    expect(despues).toBe(antes);
  });
});
