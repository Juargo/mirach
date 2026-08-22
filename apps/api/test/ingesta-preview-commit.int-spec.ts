import 'dotenv/config';
import * as fs from 'fs';
import { join } from 'path';
import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../src/infrastructure/http-express/app';
import { createContainer } from '../src/composition/container';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { loginAsSeededUser, type Sesion } from './support/login.e2e-helper';
import { AesGcmCryptoService } from '../src/infrastructure/persistence/aes-gcm-crypto.service';
import { HmacBlindIndexService } from '../src/infrastructure/persistence/hmac-blind-index.service';
import { deriveBlindIndexKey } from '../src/composition/derive-blind-index-key';
import { buildTestEnv } from './support/env.fixture';
import { ProcessIngestaUseCase } from '../src/application/use-cases/process-ingesta.use-case';
import { crearProcessIngesta } from '../src/composition/crear-process-ingesta';
import { crearCommitIngesta } from '../src/composition/crear-commit-ingesta';
import { crearPreviewIngesta } from '../src/composition/crear-preview-ingesta';
import { CommitIngestaUseCase } from '../src/application/use-cases/commit-ingesta.use-case';
import { PreviewIngestaUseCase } from '../src/application/use-cases/preview-ingesta.use-case';
import { IFileReader } from '../src/application/ports/file-reader.port';
import { createPinoLogger } from '../src/infrastructure/logging/pino-logger';
import { CategorizacionFallidaError } from '../src/domain/errors/categorizacion-fallida.error';
import type { ICatalogoClasificacion } from '../src/application/ports/catalogo-clasificacion.port';
import { Result } from '../src/shared/result';
import type { ICryptoService } from '../src/application/ports/crypto-service.port';
import type { IBlindIndexService } from '../src/application/ports/blind-index-service.port';
import type { ILogger } from '../src/application/ports/logger.port';
// Concrete graph used to rebuild CommitIngestaUseCase with a failing catalog
// (catalog-down integration test). Mirrors crearCommitIngesta wiring exactly
// EXCEPT the ICatalogoClasificacion collaborator.
import { EjecutarPipelineIngestaUseCase } from '../src/application/use-cases/ejecutar-pipeline-ingesta.use-case';
import { CategorizarTransaccionUseCase } from '../src/application/use-cases/categorizar-transaccion.use-case';
import { DetectarDuplicadosUseCase } from '../src/application/use-cases/detectar-duplicados.use-case';
import { PersistTransactionsUseCase } from '../src/application/use-cases/persist-transactions.use-case';
import { IngestFileUseCase } from '../src/application/use-cases/ingest-file.use-case';
import { DetectBankUseCase } from '../src/application/use-cases/detect-bank.use-case';
import { DetectPdfBankUseCase } from '../src/application/use-cases/detect-pdf-bank.use-case';
import { ValidateStructureUseCase } from '../src/application/use-cases/validate-structure.use-case';
import { ValidatePdfStructureUseCase } from '../src/application/use-cases/validate-pdf-structure.use-case';
import { NormalizeTransactionsUseCase } from '../src/application/use-cases/normalize-transactions.use-case';
import { NormalizePdfTransactionsUseCase } from '../src/application/use-cases/normalize-pdf-transactions.use-case';
import { ExcelBankDetectorService } from '../src/infrastructure/excel/excel-bank-detector.service';
import { ExcelStructureValidatorService } from '../src/infrastructure/excel/excel-structure-validator.service';
import { ExcelTransactionNormalizerService } from '../src/infrastructure/excel/excel-transaction-normalizer.service';
import { PdfjsBankDetectorService } from '../src/infrastructure/pdf/pdfjs-bank-detector.service';
import { PdfjsStructureValidatorService } from '../src/infrastructure/pdf/pdfjs-structure-validator.service';
import { PdfjsTransactionNormalizerService } from '../src/infrastructure/pdf/pdfjs-transaction-normalizer.service';
import { PrismaAccountRepository } from '../src/infrastructure/persistence/prisma-account.repository';
import { PrismaIngestaRepository } from '../src/infrastructure/persistence/prisma-ingesta.repository';
import { PrismaRegistrarIngestaFallidaRepository } from '../src/infrastructure/persistence/prisma-registrar-ingesta-fallida.repository';
import { PrismaCategoriaRepository } from '../src/infrastructure/persistence/prisma-categoria.repository';
import { PrismaTransaccionExistenteReader } from '../src/infrastructure/persistence/prisma-transaccion-existente.reader';

/**
 * Integration tests for US-057 — Import Preview + Commit (PR6, T-33).
 *
 * Tests the full preview→commit split against the real local ephemeral DB:
 *   - CA-01 no-write: preview creates no DB rows (multiple calls, idempotent)
 *   - CA-06 user isolation: preview and commit are scoped to the caller's account
 *   - CA-03 dedup-at-commit: second commit omits duplicates, reports count
 *   - CA-02 overlay persistence: committed rows carry overlaid categoriaId + bucketId
 *   - Catalog-down: commit with findAll failure persists NOTHING (D-10/Fix 4)
 *   - One-shot regression guard: ProcessIngestaUseCase persists Transaccion rows;
 *     integration level catches the FK-violation class only (§7 TDD constraint b, DB-level)
 *   - D-17 decrypt regression: preview with prior import detects correct duplicates
 *
 * Requires ALLOW_DESTRUCTIVE_DB=1 and a local PostgreSQL from apps/api/docs/local-test-db.md.
 * Run via `pnpm api test:integration` (vitest.int.config.ts).
 *
 * Each describe block manages its own users + teardown (no cross-block state).
 * fileParallelism: false in the int config prevents race conditions.
 */

/** Minimal IFileReader wrapping a fixed buffer — reusable across calls. */
class BufferFileReader implements IFileReader {
  constructor(
    private readonly buffer: Buffer,
    private readonly originalName: string,
  ) {}
  getBuffer(): Buffer {
    return this.buffer;
  }
  getOriginalName(): string {
    return this.originalName;
  }
  getSizeInBytes(): number {
    return this.buffer.byteLength;
  }
}

const fixturesDir = join(__dirname, 'fixtures');
const xlsxFixture = join(fixturesDir, 'movimientos-test.xlsx');
const xlsFixture = join(fixturesDir, 'cartola-test.xls');
const API_KEY = process.env.API_KEY ?? '';

/**
 * Builds a real CommitIngestaUseCase graph with ALL production Prisma adapters
 * EXCEPT the ICatalogoClasificacion collaborator, which the caller supplies.
 * Mirrors `crearCommitIngesta` (crear-commit-ingesta.ts) faithfully — used by
 * the catalog-down integration test to inject a failing catalog while keeping
 * the write path real (so a leaked write would actually hit the DB).
 */
function crearCommitIngestaConCatalogo(
  prisma: PrismaClient,
  crypto: ICryptoService,
  blindIndex: IBlindIndexService,
  logger: ILogger,
  catalogo: ICatalogoClasificacion,
): CommitIngestaUseCase {
  const ejecutarPipelineUseCase = new EjecutarPipelineIngestaUseCase(
    new IngestFileUseCase(logger),
    new DetectBankUseCase(new ExcelBankDetectorService(), logger),
    new DetectPdfBankUseCase(new PdfjsBankDetectorService(), logger),
    new ValidateStructureUseCase(new ExcelStructureValidatorService(), logger),
    new ValidatePdfStructureUseCase(
      new PdfjsStructureValidatorService(),
      logger,
    ),
    new NormalizeTransactionsUseCase(
      new ExcelTransactionNormalizerService(),
      logger,
    ),
    new NormalizePdfTransactionsUseCase(
      new PdfjsTransactionNormalizerService(),
      logger,
    ),
    logger,
  );

  return new CommitIngestaUseCase(
    ejecutarPipelineUseCase,
    new PrismaAccountRepository(prisma, crypto, blindIndex),
    new DetectarDuplicadosUseCase(
      new PrismaTransaccionExistenteReader(prisma, crypto),
      logger,
    ),
    catalogo,
    new PrismaCategoriaRepository(prisma),
    new CategorizarTransaccionUseCase(logger),
    new PersistTransactionsUseCase(
      new PrismaIngestaRepository(prisma, crypto),
      logger,
    ),
    new PrismaRegistrarIngestaFallidaRepository(prisma),
    logger,
  );
}

/** ICatalogoClasificacion stub whose findAll always fails (catalog-down). */
class FailingCatalogo implements ICatalogoClasificacion {
  async findAll(): Promise<Result<never, CategorizacionFallidaError>> {
    return Result.fail(
      new CategorizacionFallidaError('catálogo no disponible'),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1 — CA-01 no-write: preview via HTTP creates zero DB rows (PREV-EXT-02)
// ─────────────────────────────────────────────────────────────────────────────

describe('US-057 CA-01 — preview writes nothing to the DB (HTTP, PREV-EXT-02)', () => {
  let app: Express;
  let prisma: PrismaClient;
  let sesion: Sesion;

  // beforeAll/afterAll per sibling pattern: the 3 cases each capture their own
  // baseline counts inside the test body, so a shared connection is safe and
  // isolation between cases is not required (each asserts delta = 0 against its
  // own snapshot).
  beforeAll(async () => {
    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();
    app = createApp(createContainer(env, prisma), env);
    sesion = await loginAsSeededUser(app);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('CA-01.1: POST /api/ingestas/preview creates no Account, Ingesta, or Transaccion row', async () => {
    const antesAccounts = await prisma.account.count();
    const antesIngestas = await prisma.ingesta.count();
    const antesTransacciones = await prisma.transaccion.count();

    const res = await request(app)
      .post('/api/ingestas/preview')
      .set('x-api-key', API_KEY)
      .set('Cookie', sesion.cookie)
      .attach('file', xlsxFixture, 'ca01-movimientos.xlsx')
      .expect(200);

    expect(res.body.resumen).toBeDefined();
    expect(res.body.filas).toBeDefined();
    expect(Array.isArray(res.body.filas)).toBe(true);

    expect(await prisma.account.count()).toBe(antesAccounts);
    expect(await prisma.ingesta.count()).toBe(antesIngestas);
    expect(await prisma.transaccion.count()).toBe(antesTransacciones);
  });

  it('CA-01.2: three consecutive previews of the same file accumulate no DB rows (idempotency)', async () => {
    const antesAccounts = await prisma.account.count();
    const antesIngestas = await prisma.ingesta.count();
    const antesTransacciones = await prisma.transaccion.count();

    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/api/ingestas/preview')
        .set('x-api-key', API_KEY)
        .set('Cookie', sesion.cookie)
        .attach('file', xlsxFixture, `ca01-repeat-${i}.xlsx`)
        .expect(200);
    }

    expect(await prisma.account.count()).toBe(antesAccounts);
    expect(await prisma.ingesta.count()).toBe(antesIngestas);
    expect(await prisma.transaccion.count()).toBe(antesTransacciones);
  });

  it('CA-01.3: preview of an unknown-bank file returns 400 and creates no rows', async () => {
    const antesIngestas = await prisma.ingesta.count();

    await request(app)
      .post('/api/ingestas/preview')
      .set('x-api-key', API_KEY)
      .set('Cookie', sesion.cookie)
      .attach('file', xlsFixture)
      .expect(400);

    expect(await prisma.ingesta.count()).toBe(antesIngestas);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2 — CA-06 user isolation: PREVIEW dedup scoped per user (PREV-EXT-01)
// ─────────────────────────────────────────────────────────────────────────────

describe('US-057 CA-06.P — user isolation in preview dedup (PREV-EXT-01, RNF-SEC-006)', () => {
  const RUN_ID = `ca06-preview-${Date.now()}`;
  const USER_A = `user-a-${RUN_ID}`;
  const USER_B = `user-b-${RUN_ID}`;

  let prisma: PrismaClient;
  let processIngestaA: ProcessIngestaUseCase;
  let previewIngesta: PreviewIngestaUseCase;

  const xlsxBuffer = fs.readFileSync(xlsxFixture);

  beforeAll(async () => {
    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();

    const cryptoService = new AesGcmCryptoService(
      Buffer.from(buildTestEnv().ENCRYPTION_KEY, 'base64'),
    );
    const blindIndex = new HmacBlindIndexService(
      deriveBlindIndexKey(Buffer.from(buildTestEnv().ENCRYPTION_KEY, 'base64')),
    );
    const logger = createPinoLogger({ pretty: false });

    // Setup writer: user A imports (one-shot is fine — it's just seeding A's history).
    processIngestaA = crearProcessIngesta(
      prisma,
      cryptoService,
      blindIndex,
      logger,
    );
    // Subject under test: the real read-only preview use case (same wiring prod uses).
    previewIngesta = crearPreviewIngesta(
      prisma,
      cryptoService,
      blindIndex,
      logger,
    );

    await prisma.user.create({ data: { id: USER_A, nombre: `A ${RUN_ID}` } });
    await prisma.user.create({ data: { id: USER_B, nombre: `B ${RUN_ID}` } });
  });

  afterAll(async () => {
    await prisma.transaccion.deleteMany({
      where: { account: { userId: { in: [USER_A, USER_B] } } },
    });
    await prisma.ingesta.deleteMany({
      where: { userId: { in: [USER_A, USER_B] } },
    });
    await prisma.account.deleteMany({
      where: { userId: { in: [USER_A, USER_B] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [USER_A, USER_B] } } });
    await prisma.$disconnect();
  });

  it('CA-06.P: user B previews the same file user A already imported — B sees zero duplicates and writes nothing; then A sees its own duplicates (dedup path is real, not vacuous)', async () => {
    // Baseline: B has no rows at all.
    const antesTxB = await prisma.transaccion.count({
      where: { account: { userId: USER_B } },
    });
    expect(antesTxB).toBe(0);

    // --- Setup: user A imports the fixture, creating A's Account + Transaccion history.
    const resultA = await processIngestaA.execute({
      fileReader: new BufferFileReader(
        xlsxBuffer,
        `isolation-a-${RUN_ID}.xlsx`,
      ),
      userId: USER_A,
    });
    expect(resultA.isOk()).toBe(true);
    const { total: totalA } = resultA.getValue();
    expect(totalA).toBeGreaterThan(0);

    // --- Assertion 1 (isolation): user B previews the SAME file.
    // B has no BCI account, so findByBanco → null and every row is new to B.
    const previewB = await previewIngesta.execute({
      fileReader: new BufferFileReader(
        xlsxBuffer,
        `isolation-preview-b-${RUN_ID}.xlsx`,
      ),
      userId: USER_B,
    });
    expect(previewB.isOk()).toBe(true);
    const previewBValue = previewB.getValue();
    // B must NOT see A's transactions as duplicates (cross-tenant isolation).
    expect(previewBValue.resumen.duplicadosDetectados).toBe(0);
    expect(previewBValue.resumen.nuevas).toBe(previewBValue.resumen.totalFilas);
    for (const fila of previewBValue.filas) {
      expect(fila.esDuplicado).toBe(false);
    }
    // Preview is read-only: B still has zero rows after previewing.
    const despuesTxB = await prisma.transaccion.count({
      where: { account: { userId: USER_B } },
    });
    expect(despuesTxB).toBe(0);
    const ingestasB = await prisma.ingesta.count({ where: { userId: USER_B } });
    expect(ingestasB).toBe(0);

    // --- Assertion 2 (non-vacuous): user A previews the SAME file.
    // A DOES own the imported history, so the dedup path must flag its own rows.
    const previewA = await previewIngesta.execute({
      fileReader: new BufferFileReader(
        xlsxBuffer,
        `isolation-preview-a-${RUN_ID}.xlsx`,
      ),
      userId: USER_A,
    });
    expect(previewA.isOk()).toBe(true);
    const previewAValue = previewA.getValue();
    // A sees its own history → duplicates detected. Proves the isolation above is
    // real and not simply "dedup never matches anything".
    expect(previewAValue.resumen.duplicadosDetectados).toBeGreaterThan(0);
    expect(previewAValue.resumen.duplicadosDetectados).toBe(totalA);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3 — CA-06 commit isolation: cross-tenant categoriaId is rejected (CMT-03)
// ─────────────────────────────────────────────────────────────────────────────

describe('US-057 CA-06 — commit isolation: cross-tenant categoriaId rejected (CMT-03, RNF-SEC-006)', () => {
  const RUN_ID = `ca06-commit-${Date.now()}`;
  const USER_B = `user-b-commit-${RUN_ID}`;

  let prisma: PrismaClient;
  let appForA: Express;
  let sesionA: Sesion;
  let catIdBelongingToA: string;

  const xlsxBuffer = fs.readFileSync(xlsxFixture);

  beforeAll(async () => {
    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();
    appForA = createApp(createContainer(env, prisma), env);

    // Use the seeded user as user A (we can log in as them).
    // Catalog: fetch a categoriaId belonging to the seeded user.
    sesionA = await loginAsSeededUser(appForA);

    // Get a category that belongs to the seeded user
    // GET /api/categorias returns { categorias: [...] } envelope (aCatalogoDto)
    const catalogo = await request(appForA)
      .get('/api/categorias')
      .set('x-api-key', API_KEY)
      .set('Cookie', sesionA.cookie)
      .expect(200);
    catIdBelongingToA = catalogo.body.categorias?.[0]?.id;
    expect(catIdBelongingToA).toBeTruthy();

    await prisma.user.create({ data: { id: USER_B, nombre: `B ${RUN_ID}` } });
  });

  afterAll(async () => {
    await prisma.transaccion.deleteMany({
      where: { account: { userId: USER_B } },
    });
    await prisma.ingesta.deleteMany({ where: { userId: USER_B } });
    await prisma.account.deleteMany({ where: { userId: USER_B } });
    await prisma.user.deleteMany({ where: { id: USER_B } });
    await prisma.$disconnect();
  });

  it('CA-06.C: user B commit with a categoriaId from user A returns CategoriaFueraDeCatalogoError; neither B nor A gets any write', async () => {
    // Capture user A's (the seeded user's) DB state BEFORE the attack, so we can
    // prove the cross-tenant attempt did not mutate the victim's data either.
    const userIdA = sesionA.userId;
    const antesTxA = await prisma.transaccion.count({
      where: { account: { userId: userIdA } },
    });
    const antesIngestasA = await prisma.ingesta.count({
      where: { userId: userIdA },
    });

    // User B tries to commit a cartola with an overlay pointing to user A's categoriaId.
    // This must fail — cross-tenant rejection (D-10, RNF-SEC-006).
    const cryptoService = new AesGcmCryptoService(
      Buffer.from(buildTestEnv().ENCRYPTION_KEY, 'base64'),
    );
    const blindIdx = new HmacBlindIndexService(
      deriveBlindIndexKey(Buffer.from(buildTestEnv().ENCRYPTION_KEY, 'base64')),
    );
    const logger = createPinoLogger({ pretty: false });
    const commitB = crearCommitIngesta(prisma, cryptoService, blindIdx, logger);

    const result = await commitB.execute({
      fileReader: new BufferFileReader(
        xlsxBuffer,
        `cross-tenant-${RUN_ID}.xlsx`,
      ),
      userId: USER_B,
      edits: [{ rowIndex: 0, categoriaId: catIdBelongingToA }],
    });

    expect(result.isFail()).toBe(true);
    // Must be CategoriaFueraDeCatalogoError (cross-tenant, D-10)
    expect(result.getError().constructor.name).toBe(
      'CategoriaFueraDeCatalogoError',
    );

    // Attacker (user B) persisted NOTHING.
    const txCountB = await prisma.transaccion.count({
      where: { account: { userId: USER_B } },
    });
    expect(txCountB).toBe(0);
    const ingestaCountB = await prisma.ingesta.count({
      where: { userId: USER_B },
    });
    expect(ingestaCountB).toBe(0);

    // Victim (user A) is untouched — the cross-tenant attempt did not read-modify
    // or leak into A's Account/Ingesta/Transaccion.
    const despuesTxA = await prisma.transaccion.count({
      where: { account: { userId: userIdA } },
    });
    const despuesIngestasA = await prisma.ingesta.count({
      where: { userId: userIdA },
    });
    expect(despuesTxA).toBe(antesTxA);
    expect(despuesIngestasA).toBe(antesIngestasA);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4 — CA-03 dedup-at-commit: second commit omits duplicates (CMT-02)
// ─────────────────────────────────────────────────────────────────────────────

describe('US-057 CA-03 — dedup-at-commit: second commit omits duplicates without aborting (CMT-02)', () => {
  const RUN_ID = `ca03-${Date.now()}`;
  const USER_ID = `user-ca03-${RUN_ID}`;

  let prisma: PrismaClient;
  let commitUseCase: CommitIngestaUseCase;
  const xlsxBuffer = fs.readFileSync(xlsxFixture);

  beforeAll(async () => {
    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();

    const cryptoService = new AesGcmCryptoService(
      Buffer.from(buildTestEnv().ENCRYPTION_KEY, 'base64'),
    );
    const blindIdx = new HmacBlindIndexService(
      deriveBlindIndexKey(Buffer.from(buildTestEnv().ENCRYPTION_KEY, 'base64')),
    );
    const logger = createPinoLogger({ pretty: false });
    commitUseCase = crearCommitIngesta(prisma, cryptoService, blindIdx, logger);

    await prisma.user.create({
      data: { id: USER_ID, nombre: `CA03 ${RUN_ID}` },
    });
  });

  afterAll(async () => {
    await prisma.transaccion.deleteMany({
      where: { account: { userId: USER_ID } },
    });
    await prisma.ingesta.deleteMany({ where: { userId: USER_ID } });
    await prisma.account.deleteMany({ where: { userId: USER_ID } });
    await prisma.user.deleteMany({ where: { id: USER_ID } });
    await prisma.$disconnect();
  });

  it('CA-03: second commit of the same file omits all rows as duplicates, never aborts', async () => {
    // First commit — all rows are new
    const firstResult = await commitUseCase.execute({
      fileReader: new BufferFileReader(xlsxBuffer, `ca03-first-${RUN_ID}.xlsx`),
      userId: USER_ID,
      edits: [],
    });
    expect(firstResult.isOk()).toBe(true);
    const { totalTransacciones: firstTotal, duplicadosOmitidos: firstDups } =
      firstResult.getValue();
    expect(firstTotal).toBeGreaterThan(0);
    expect(firstDups).toBe(0);

    // Verify first ingesta in DB
    const firstIngestas = await prisma.ingesta.findMany({
      where: { userId: USER_ID },
    });
    expect(firstIngestas).toHaveLength(1);
    expect(firstIngestas[0].estado).toBe('PROCESADA');
    expect(firstIngestas[0].totalTransacciones).toBe(firstTotal);
    expect(firstIngestas[0].duplicadosOmitidos).toBe(0);

    const txAfterFirst = await prisma.transaccion.count({
      where: { account: { userId: USER_ID } },
    });
    expect(txAfterFirst).toBe(firstTotal);

    // Second commit of the SAME file — all rows are duplicates now
    const secondResult = await commitUseCase.execute({
      fileReader: new BufferFileReader(
        xlsxBuffer,
        `ca03-second-${RUN_ID}.xlsx`,
      ),
      userId: USER_ID,
      edits: [],
    });
    expect(secondResult.isOk()).toBe(true);
    const { totalTransacciones: secondTotal, duplicadosOmitidos: secondDups } =
      secondResult.getValue();
    // All rows omitted as duplicates; commit never aborts (CMT-02)
    expect(secondTotal).toBe(0);
    expect(secondDups).toBe(firstTotal);

    // Second ingesta recorded in DB (PROCESADA, not FALLIDA)
    const allIngestas = await prisma.ingesta.findMany({
      where: { userId: USER_ID },
      orderBy: { creadoEn: 'asc' },
    });
    expect(allIngestas).toHaveLength(2);
    expect(allIngestas[1].estado).toBe('PROCESADA');
    expect(allIngestas[1].totalTransacciones).toBe(0);
    expect(allIngestas[1].duplicadosOmitidos).toBe(firstTotal);

    // DB transaction count unchanged — no new rows added by the second commit
    const txAfterSecond = await prisma.transaccion.count({
      where: { account: { userId: USER_ID } },
    });
    expect(txAfterSecond).toBe(txAfterFirst);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 5 — CA-02 overlay persistence: committed rows carry categoriaId + bucketId (CMT-04)
// ─────────────────────────────────────────────────────────────────────────────

describe('US-057 CA-02 — overlay persistence: committed rows carry categoriaId + bucketId in DB (CMT-04)', () => {
  const RUN_ID = `ca02-${Date.now()}`;
  const USER_ID = `user-ca02-${RUN_ID}`;

  let prisma: PrismaClient;
  let app: Express;
  let sesion: Sesion;
  let commitUseCase: CommitIngestaUseCase;
  let previewIngesta: PreviewIngestaUseCase;
  let catId: string;
  const xlsxBuffer = fs.readFileSync(xlsxFixture);

  beforeAll(async () => {
    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();

    const cryptoService = new AesGcmCryptoService(
      Buffer.from(buildTestEnv().ENCRYPTION_KEY, 'base64'),
    );
    const blindIdx = new HmacBlindIndexService(
      deriveBlindIndexKey(Buffer.from(buildTestEnv().ENCRYPTION_KEY, 'base64')),
    );
    const logger = createPinoLogger({ pretty: false });
    previewIngesta = crearPreviewIngesta(
      prisma,
      cryptoService,
      blindIdx,
      logger,
    );

    app = createApp(createContainer(env, prisma), env);
    sesion = await loginAsSeededUser(app);

    // Fetch a categoria belonging to the seeded user (USER = seed user)
    // GET /api/categorias returns { categorias: [...] } envelope (aCatalogoDto)
    const catalogo = await request(app)
      .get('/api/categorias')
      .set('x-api-key', API_KEY)
      .set('Cookie', sesion.cookie)
      .expect(200);
    catId = catalogo.body.categorias?.[0]?.id;
    expect(catId).toBeTruthy();

    // Use the SEEDED user's ID for commitUseCase (matches sesion.userId)
    commitUseCase = crearCommitIngesta(prisma, cryptoService, blindIdx, logger);

    await prisma.user.create({
      data: { id: USER_ID, nombre: `CA02 ${RUN_ID}` },
    });
  });

  afterAll(async () => {
    // Seed user cleanup is handled by the seed teardown; only clean the ephemeral user
    await prisma.transaccion.deleteMany({
      where: { account: { userId: USER_ID } },
    });
    await prisma.ingesta.deleteMany({ where: { userId: USER_ID } });
    await prisma.account.deleteMany({ where: { userId: USER_ID } });
    await prisma.user.deleteMany({ where: { id: USER_ID } });
    await prisma.$disconnect();
  });

  it('CA-02: the overlaid row (identified by natural key, not cuid order) carries categoriaId + bucketId in DB; other rows do not', async () => {
    // Get the seeded user's userId from login
    const seedUserId = sesion.userId;

    // STEP 1 — preview first to learn the NATURAL KEY of rowIndex 0.
    // `descripcion` is encrypted at rest (ADR-013), so we identify the row by its
    // plaintext columns: fecha + cargo + abono. rowIndex 0 of the pre-dedup file
    // maps 1:1 to a persisted row because this is a fresh import (no duplicates).
    const preview = await previewIngesta.execute({
      fileReader: new BufferFileReader(
        xlsxBuffer,
        `ca02-preview-${RUN_ID}.xlsx`,
      ),
      userId: seedUserId,
    });
    expect(preview.isOk()).toBe(true);
    const row0 = preview.getValue().filas.find((f) => f.rowIndex === 0);
    expect(row0).toBeDefined();
    // Guard: rowIndex 0 must not already be a duplicate (would break the 1:1 map).
    expect(row0!.esDuplicado).toBe(false);
    const row0Fecha = row0!.transaccion.fecha;
    const row0Cargo = row0!.transaccion.cargo;
    const row0Abono = row0!.transaccion.abono;

    // STEP 2 — commit for the seed user (rowIndex 0 gets an overlay with catId).
    const result = await commitUseCase.execute({
      fileReader: new BufferFileReader(
        xlsxBuffer,
        `ca02-overlay-${RUN_ID}.xlsx`,
      ),
      userId: seedUserId,
      edits: [{ rowIndex: 0, categoriaId: catId }],
    });
    expect(result.isOk()).toBe(true);
    const { ingestaId } = result.getValue();

    // STEP 3 — find the overlaid row by NATURAL KEY (fecha + cargo + abono),
    // NOT by cuid ordering. createMany does not guarantee id order reflects file order.
    const overlaidRows = await prisma.transaccion.findMany({
      where: {
        ingestaId,
        fecha: row0Fecha,
        cargo: row0Cargo,
        abono: row0Abono,
      },
    });
    // The natural key must resolve to exactly the overlaid row.
    expect(overlaidRows).toHaveLength(1);
    const overlaidRow = overlaidRows[0];
    expect(overlaidRow.categoriaId).toBe(catId);
    // bucketId must be non-null — aPersistencia resolves the Bucket enum → FK (D-15).
    expect(overlaidRow.bucketId).not.toBeNull();

    // STEP 4 — every OTHER row of this ingesta must NOT carry the overlaid categoriaId
    // (the overlay targeted a single row; the rest auto-classify to null categoria).
    const otherRows = await prisma.transaccion.findMany({
      where: { ingestaId, id: { not: overlaidRow.id } },
      select: { categoriaId: true },
    });
    for (const other of otherRows) {
      expect(other.categoriaId).not.toBe(catId);
    }

    // Cleanup: remove the ingesta + transactions for the seeded user from this run.
    await prisma.transaccion.deleteMany({ where: { ingestaId } });
    await prisma.ingesta.deleteMany({ where: { id: ingestaId } });
    // The Account created by ensure() is left in place — the seeded user may have
    // other ingestas against the same bank; removing it could break sibling data.
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 5b — Catalog-down at commit: findAll failure persists NOTHING (D-10 fail-closed)
// ─────────────────────────────────────────────────────────────────────────────

describe('US-057 catalog-down — commit with findAll failure persists nothing (D-10 fail-closed)', () => {
  const RUN_ID = `catalog-down-${Date.now()}`;
  const USER_ID = `user-catdown-${RUN_ID}`;

  let prisma: PrismaClient;
  let commitConCatalogoCaido: CommitIngestaUseCase;
  const xlsxBuffer = fs.readFileSync(xlsxFixture);

  beforeAll(async () => {
    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();

    const cryptoService = new AesGcmCryptoService(
      Buffer.from(buildTestEnv().ENCRYPTION_KEY, 'base64'),
    );
    const blindIdx = new HmacBlindIndexService(
      deriveBlindIndexKey(Buffer.from(buildTestEnv().ENCRYPTION_KEY, 'base64')),
    );
    const logger = createPinoLogger({ pretty: false });

    // Real write path (PrismaAccountRepository, PrismaIngestaRepository, ...) but
    // a FAILING catalog. If the fail-closed guard were broken and persistence
    // leaked, it would hit the real DB and the row-count assertions would catch it.
    commitConCatalogoCaido = crearCommitIngestaConCatalogo(
      prisma,
      cryptoService,
      blindIdx,
      logger,
      new FailingCatalogo(),
    );

    await prisma.user.create({
      data: { id: USER_ID, nombre: `CatDown ${RUN_ID}` },
    });
  });

  afterAll(async () => {
    await prisma.transaccion.deleteMany({
      where: { account: { userId: USER_ID } },
    });
    await prisma.ingesta.deleteMany({ where: { userId: USER_ID } });
    await prisma.account.deleteMany({ where: { userId: USER_ID } });
    await prisma.user.deleteMany({ where: { id: USER_ID } });
    await prisma.$disconnect();
  });

  it('catalog-down: commit returns CategorizacionFallidaError and writes zero Ingesta/Transaccion rows', async () => {
    const result = await commitConCatalogoCaido.execute({
      fileReader: new BufferFileReader(
        xlsxBuffer,
        `catalog-down-${RUN_ID}.xlsx`,
      ),
      userId: USER_ID,
      edits: [],
    });

    // Commit must fail — catalog load is REQUIRED (fail-closed, D-10).
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CategorizacionFallidaError);

    // Nothing persisted: no Ingesta and no Transaccion rows for this user.
    // (D-10/Fix 4 — catalog-down is NOT registered as FALLIDA either, but this
    // assertion focuses on the persistence side: zero write of financial data.)
    const ingestaCount = await prisma.ingesta.count({
      where: { userId: USER_ID },
    });
    expect(ingestaCount).toBe(0);
    const txCount = await prisma.transaccion.count({
      where: { account: { userId: USER_ID } },
    });
    expect(txCount).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 6 — One-shot regression guard (§7 TDD constraint b — DB-level)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One-shot regression guard (§7 TDD constraint b, T-33):
 *
 * Two distinct regression classes, split across two test levels:
 *
 *   - COLUMN-OMISSION class (mapper silently dropping bucketId/categoriaId at the
 *     boundary, with the runCategorizacion island later masking the gap): this is
 *     covered ONLY by the unit-level assertion in T-12
 *     (process-ingesta.use-case.spec.ts — asserts PersistTransactionsUseCase receives
 *     every row as { transaccion, bucket:null, categoriaId:null } at the
 *     persistirProcesada boundary). The integration level CANNOT observe that
 *     intermediate state because the island updates bucketId post-persist.
 *
 *   - FK-VIOLATION class (aPersistencia mapping a Bucket enum → an invalid FK string
 *     ⇒ Prisma FK constraint throws ⇒ no rows written): THIS is what the integration
 *     guard below catches. If the retype produced a corrupt bucketId, the insert would
 *     fail and no rows would exist; the fact that rows exist + categoriaId is null +
 *     bucketId matches the FK pattern proves the DB-level column path is wired without
 *     an FK-class break.
 */
describe('US-057 §7 TDD constraint b — one-shot regression guard (DB-level)', () => {
  const RUN_ID = `one-shot-reg-${Date.now()}`;
  const USER_ID = `user-one-shot-${RUN_ID}`;

  let prisma: PrismaClient;
  let processIngesta: ProcessIngestaUseCase;
  const xlsxBuffer = fs.readFileSync(xlsxFixture);

  beforeAll(async () => {
    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();

    const cryptoService = new AesGcmCryptoService(
      Buffer.from(buildTestEnv().ENCRYPTION_KEY, 'base64'),
    );
    const blindIdx = new HmacBlindIndexService(
      deriveBlindIndexKey(Buffer.from(buildTestEnv().ENCRYPTION_KEY, 'base64')),
    );
    const logger = createPinoLogger({ pretty: false });
    processIngesta = crearProcessIngesta(
      prisma,
      cryptoService,
      blindIdx,
      logger,
    );

    await prisma.user.create({
      data: { id: USER_ID, nombre: `OneShotReg ${RUN_ID}` },
    });
  });

  afterAll(async () => {
    await prisma.transaccion.deleteMany({
      where: { account: { userId: USER_ID } },
    });
    await prisma.ingesta.deleteMany({ where: { userId: USER_ID } });
    await prisma.account.deleteMany({ where: { userId: USER_ID } });
    await prisma.user.deleteMany({ where: { id: USER_ID } });
    await prisma.$disconnect();
  });

  it(
    'one-shot POST /api/ingestas persists Transaccion rows with categoriaId:null for all rows ' +
      '(TransaccionAPersistir retype preserves null path, §7 TDD constraint b)',
    async () => {
      const result = await processIngesta.execute({
        fileReader: new BufferFileReader(
          xlsxBuffer,
          `one-shot-guard-${RUN_ID}.xlsx`,
        ),
        userId: USER_ID,
      });

      expect(result.isOk()).toBe(true);
      const { ingestaId, total } = result.getValue();
      expect(total).toBeGreaterThan(0);

      // Fetch all Transaccion rows written by the one-shot pipeline
      const rows = await prisma.transaccion.findMany({
        where: { ingestaId },
        select: { id: true, bucketId: true, categoriaId: true },
      });

      expect(rows).toHaveLength(total);

      // REGRESSION GUARD (§7 TDD constraint b — DB-level, FK-VIOLATION class only):
      //
      // ProcessIngestaUseCase wraps each nuevas row as
      // { transaccion: tx, bucket: null, categoriaId: null } (T-12, D-11),
      // so aPersistencia maps bucket:null → bucketId:null at initial persist time.
      // After the initial persist, the `runCategorizacion` island runs and updates
      // bucketId (to 'bucket-sincategoria'/'bucket-ingreso') — that is INTENDED behavior.
      //
      // This integration guard does NOT prove the initial persist-time null mapping was
      // correct — the island overwrites bucketId before this query can observe it, so the
      // column-omission class (mapper silently dropping bucketId, island masking it) is
      // caught ONLY by the unit-level T-12 assertion at the persistirProcesada boundary.
      //
      // What this DB-level guard DOES catch (FK-violation class):
      //   (a) categoriaId MUST be null for ALL rows — the test user has no catalog patterns,
      //       so CategorizarTransaccionUseCase resolves every non-Ingreso row to SinCategoria
      //       with no category, and Ingreso rows to Ingreso with no category. The island writes
      //       categoriaId:null for both. A non-null categoriaId would signal a broken mapping.
      //   (b) bucketId MUST be a valid FK string or null — never a corrupt/invalid string.
      //       If aPersistencia mapped a Bucket enum → an invalid FK string, the Prisma FK
      //       constraint would throw and the insert would fail (zero rows). The rows existing
      //       + bucketId matching the FK pattern proves the column path is wired without an
      //       FK-class break.
      //
      // bucketId is deliberately NOT asserted null here (the island legitimately updates it).
      for (const row of rows) {
        // categoriaId must be null for all rows (no pattern matches for this user)
        expect(row.categoriaId).toBeNull();
        // bucketId is either null or a valid FK string (asserted by row existence — no FK error)
        // We only assert it's NOT an obviously wrong value (not the domain enum string).
        // 'Necesidades', 'Deseos', 'Ahorro', 'Ingreso', 'SinCategoria' are domain strings,
        // NOT valid FK strings (the FK strings are 'bucket-necesidades' etc.).
        if (row.bucketId !== null) {
          expect(row.bucketId).toMatch(/^bucket-/);
        }
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 7 — D-17 decrypt regression: preview dedup detects prior imports correctly
// ─────────────────────────────────────────────────────────────────────────────

/**
 * D-17 decrypt regression guard:
 *
 * After a real one-shot import, calling preview with the same cartola must
 * detect those rows as duplicates (esDuplicado:true in the response).
 * This proves ITransaccionExistenteReader is wired with `crypto` and decrypts
 * `descripcion` before the natural-key comparison (marcarDuplicados).
 * If crypto is missing/wrong, all esDuplicado flags would be false (random IV
 * makes every ciphertext unique — natural key can never match).
 */
describe('US-057 D-17 — decrypt regression: preview detects prior import duplicates (CMT-02)', () => {
  const RUN_ID = `d17-${Date.now()}`;

  let prisma: PrismaClient;
  let app: Express;
  let sesion: Sesion;

  // Track rows created by this suite so afterAll can delete them even if a test
  // fails mid-flight (no leaked rows into the shared seeded user). Matches the
  // historial-ingestas.int-spec.ts:96-113 cleanup pattern.
  let createdIngestaId: string | undefined;
  // Account ids that did NOT exist before this suite ran (created by ensure()).
  let accountIdsBefore: Set<string>;

  beforeAll(async () => {
    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();
    app = createApp(createContainer(env, prisma), env);
    sesion = await loginAsSeededUser(app);
    // Snapshot the seeded user's existing accounts so we only delete ones this
    // suite creates (never the seeded user's pre-existing data).
    const existing = await prisma.account.findMany({
      where: { userId: sesion.userId },
      select: { id: true },
    });
    accountIdsBefore = new Set(existing.map((a) => a.id));
  });

  afterAll(async () => {
    if (createdIngestaId !== undefined) {
      await prisma.transaccion.deleteMany({
        where: { ingestaId: createdIngestaId },
      });
      await prisma.ingesta.deleteMany({ where: { id: createdIngestaId } });
    }
    // Delete only accounts created by this suite (via ensure()), never pre-existing ones.
    const nowAccounts = await prisma.account.findMany({
      where: { userId: sesion.userId },
      select: { id: true },
    });
    const createdAccountIds = nowAccounts
      .map((a) => a.id)
      .filter((id) => !accountIdsBefore.has(id));
    if (createdAccountIds.length > 0) {
      await prisma.transaccion.deleteMany({
        where: { accountId: { in: createdAccountIds } },
      });
      await prisma.account.deleteMany({
        where: { id: { in: createdAccountIds } },
      });
    }
    await prisma.$disconnect();
  });

  it('D-17: preview after a real commit detects matching rows as esDuplicado:true (crypto wired)', async () => {
    // Step 1: commit the cartola for the seeded user (creates Account + Transaccion rows)
    const commitRes = await request(app)
      .post('/api/ingestas/commit')
      .set('x-api-key', API_KEY)
      .set('Cookie', sesion.cookie)
      .attach('file', xlsxFixture, `d17-commit-${RUN_ID}.xlsx`)
      .field('edits', '[]')
      .expect(201);

    const { totalTransacciones: committed, ingestaId } = commitRes.body;
    // Record for afterAll cleanup BEFORE any further assertion can throw.
    createdIngestaId = ingestaId;
    expect(committed).toBeGreaterThan(0);

    // Step 2: preview the SAME file — all committed rows must appear as esDuplicado:true
    const previewRes = await request(app)
      .post('/api/ingestas/preview')
      .set('x-api-key', API_KEY)
      .set('Cookie', sesion.cookie)
      .attach('file', xlsxFixture, `d17-preview-${RUN_ID}.xlsx`)
      .expect(200);

    const { resumen, filas } = previewRes.body;

    // Every row in the file should be a duplicate now
    expect(resumen.duplicadosDetectados).toBe(committed);
    expect(resumen.nuevas).toBe(resumen.totalFilas - committed);

    // All rows that were persisted must show as duplicates in the preview
    const duplicateFilas = (filas as Array<{ esDuplicado: boolean }>).filter(
      (f) => f.esDuplicado,
    );
    expect(duplicateFilas).toHaveLength(committed);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 8 — Historial: commit registers ingesta in historial; pipeline failure registers FALLIDA
// ─────────────────────────────────────────────────────────────────────────────

describe('US-057 CA-06 historial — commit registers PROCESADA; pipeline failure registers FALLIDA', () => {
  const RUN_ID = `hist-${Date.now()}`;
  const USER_ID = `user-hist-${RUN_ID}`;

  let prisma: PrismaClient;
  let commitUseCase: CommitIngestaUseCase;
  const xlsxBuffer = fs.readFileSync(xlsxFixture);
  const xlsBuffer = fs.readFileSync(xlsFixture);

  beforeAll(async () => {
    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();

    const cryptoService = new AesGcmCryptoService(
      Buffer.from(buildTestEnv().ENCRYPTION_KEY, 'base64'),
    );
    const blindIdx = new HmacBlindIndexService(
      deriveBlindIndexKey(Buffer.from(buildTestEnv().ENCRYPTION_KEY, 'base64')),
    );
    const logger = createPinoLogger({ pretty: false });
    commitUseCase = crearCommitIngesta(prisma, cryptoService, blindIdx, logger);

    await prisma.user.create({
      data: { id: USER_ID, nombre: `Hist ${RUN_ID}` },
    });
  });

  afterAll(async () => {
    await prisma.transaccion.deleteMany({
      where: { account: { userId: USER_ID } },
    });
    await prisma.ingesta.deleteMany({ where: { userId: USER_ID } });
    await prisma.account.deleteMany({ where: { userId: USER_ID } });
    await prisma.user.deleteMany({ where: { id: USER_ID } });
    await prisma.$disconnect();
  });

  it('Historial.1: successful commit registers 1 PROCESADA ingesta row in historial', async () => {
    const antesIngestas = await prisma.ingesta.count({
      where: { userId: USER_ID },
    });

    const result = await commitUseCase.execute({
      fileReader: new BufferFileReader(xlsxBuffer, `hist-ok-${RUN_ID}.xlsx`),
      userId: USER_ID,
      edits: [],
    });
    expect(result.isOk()).toBe(true);
    const { ingestaId, totalTransacciones } = result.getValue();
    expect(totalTransacciones).toBeGreaterThan(0);

    const ingestas = await prisma.ingesta.findMany({
      where: { userId: USER_ID },
    });
    expect(ingestas).toHaveLength(antesIngestas + 1);

    const ingesta = ingestas.find((i) => i.id === ingestaId);
    expect(ingesta).toBeDefined();
    expect(ingesta!.estado).toBe('PROCESADA');
    expect(ingesta!.accountId).not.toBeNull();
    expect(ingesta!.banco).not.toBeNull();
    expect(ingesta!.totalTransacciones).toBe(totalTransacciones);
    expect(ingesta!.userId).toBe(USER_ID);
  });

  it('Historial.2: pipeline failure at commit (invalid extension) registers 1 FALLIDA ingesta row', async () => {
    const antesIngestas = await prisma.ingesta.count({
      where: { userId: USER_ID },
    });

    const result = await commitUseCase.execute({
      fileReader: new BufferFileReader(xlsBuffer, `hist-fail-${RUN_ID}.xls`),
      userId: USER_ID,
      edits: [],
    });
    expect(result.isFail()).toBe(true);

    const ingestas = await prisma.ingesta.findMany({
      where: { userId: USER_ID },
    });
    expect(ingestas).toHaveLength(antesIngestas + 1);

    const fallidaRow = ingestas.find((i) => i.estado === 'FALLIDA');
    expect(fallidaRow).toBeDefined();
    expect(fallidaRow!.accountId).toBeNull();
    expect(fallidaRow!.motivoFallo).toBeTruthy();
  });
});
