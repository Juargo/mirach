/**
 * commit-ingesta.use-case.spec.ts — Unit tests for CommitIngestaUseCase (US-057 T-15 RED→GREEN).
 *
 * Covers spec scenarios CMT-01 through CMT-05 and design constraints
 * D-01/D-03/D-04/D-10/D-11/D-11a/D-13/D-15/D-16/D-17/D-18.
 *
 * Strategy: real PersistTransactionsUseCase wired with FakeIngestaRepository
 * so we can inspect both the TransaccionAPersistir[] array (application boundary)
 * and the behaviour of aPersistencia (which resolves bucket→FK in the adapter).
 *
 * Pipeline fakes are wrapped in their concrete use-case classes (same pattern
 * as preview-ingesta.use-case.spec.ts, D-01 sibling).
 */
import { describe, it, expect } from 'vitest';
import {
  CommitIngestaUseCase,
  type CommitEdit,
} from './commit-ingesta.use-case';
import { EjecutarPipelineIngestaUseCase } from './ejecutar-pipeline-ingesta.use-case';
import { PersistTransactionsUseCase } from './persist-transactions.use-case';
import { DetectarDuplicadosUseCase } from './detectar-duplicados.use-case';
import { CategorizarTransaccionUseCase } from './categorizar-transaccion.use-case';
import { IngestFileUseCase } from './ingest-file.use-case';
import { DetectBankUseCase } from './detect-bank.use-case';
import { DetectPdfBankUseCase } from './detect-pdf-bank.use-case';
import { ValidateStructureUseCase } from './validate-structure.use-case';
import { ValidatePdfStructureUseCase } from './validate-pdf-structure.use-case';
import { NormalizeTransactionsUseCase } from './normalize-transactions.use-case';
import { NormalizePdfTransactionsUseCase } from './normalize-pdf-transactions.use-case';
import { Result } from '../../shared/result';
import { Transaccion } from '../../domain/value-objects/transaccion';
import { Bucket } from '../../domain/value-objects/bucket';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../domain/value-objects/tipo-cuenta';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';
import { CategorizacionFallidaError } from '../../domain/errors/categorizacion-fallida.error';
import { BancoNoReconocidoError } from '../../domain/errors/banco-no-reconocido.error';
import { NormalizacionInvalidaError } from '../../domain/errors/normalizacion-invalida.error';
import { RowIndexFueraDeRangoError } from '../../domain/errors/row-index-fuera-de-rango.error';
import { CategoriaFueraDeCatalogoError } from '../../domain/errors/categoria-fuera-de-catalogo.error';
import type { IFileReader } from '../ports/file-reader.port';
import type { IBankDetector, DetectedBank } from '../ports/bank-detector.port';
import type { IPdfBankDetector } from '../ports/pdf-bank-detector.port';
import type {
  IStructureValidator,
  ValidatedStructure,
} from '../ports/structure-validator.port';
import type {
  IPdfStructureValidator,
  EstructuraPdfValidada,
} from '../ports/pdf-structure-validator.port';
import type { ITransactionNormalizer } from '../ports/transaction-normalizer.port';
import type { IPdfTransactionNormalizer } from '../ports/pdf-transaction-normalizer.port';
import type { IAccountRepository } from '../ports/account-repository.port';
import type {
  ITransaccionExistenteReader,
  TransaccionExistente,
} from '../ports/transaccion-existente-reader.port';
import type { ICatalogoClasificacion } from '../ports/catalogo-clasificacion.port';
import type {
  CategoriaConPatrones,
  ICategoriaRepository,
} from '../ports/categoria-repository.port';
import type { IRegistrarIngestaFallidaWriter } from '../ports/registrar-ingesta-fallida.port';
import type {
  IIngestaRepository,
  CrearIngestaProcesadaInput,
} from '../ports/ingesta-repository.port';
import type { CategoriaNoEncontradaError } from '../../domain/errors/categoria-no-encontrada.error';
import { NoOpLogger } from '../../../test/support/logger.double';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BANCO: DetectedBank = {
  banco: BancoConocido.BancoEstado,
  tipoCuenta: TipoCuentaConocido.CuentaRut,
  numeroCuenta: '111222333',
};

const ESTRUCTURA: ValidatedStructure = {
  banco: BancoConocido.BancoEstado,
  filaEncabezados: 1,
  primeraFilaDatos: 2,
  totalFilasDatos: 3,
};

const ESTRUCTURA_PDF: EstructuraPdfValidada = {
  banco: BancoConocido.BancoEstado,
  paginaInicioTabla: 1,
  rangosX: [],
  toleranciaY: 2,
};

const USUARIO_ID = 'user-123';
const ACCOUNT_ID = 'account-abc';
const INGESTA_ID = 'ingesta-xyz';

const CAT_NECESIDADES_ID = 'cat-necesidades-1';
const CAT_AHORRO_ID = 'cat-ahorro-1';
const CAT_SIN_PATRON_ID = 'cat-sin-patron-1';

// ---------------------------------------------------------------------------
// Helper: Transaccion factory
// ---------------------------------------------------------------------------
function crearTx(
  descripcion: string,
  cargo: bigint = 1000n,
  abono: bigint = 0n,
): Transaccion {
  return Transaccion.crear({
    fecha: new Date('2026-05-14T00:00:00.000Z'),
    descripcion,
    cargo,
    abono,
  }).getValue();
}

// Three test transactions (no duplicates by default):
//   TX0: Necesidades candidate (cargo only)
//   TX1: Deseos candidate (cargo only)
//   TX2: Ingreso rule (abono > 0, cargo === 0)
const TX0 = crearTx('Supermercado', 15000n, 0n);
const TX1 = crearTx('Netflix', 10000n, 0n);
const TX2 = crearTx('Deposito ingreso', 0n, 500000n);
const TXS: Transaccion[] = [TX0, TX1, TX2];

// ---------------------------------------------------------------------------
// Fakes: file reader
// ---------------------------------------------------------------------------
class FakeFileReader implements IFileReader {
  getBuffer(): Buffer {
    return Buffer.from('PK\x03\x04'); // minimal valid buffer for IngestFileUseCase extension check
  }
  getOriginalName(): string {
    return 'cartola.xlsx';
  }
  getSizeInBytes(): number {
    return 4;
  }
}

// ---------------------------------------------------------------------------
// Fakes: pipeline collaborators — implementing the PORT interfaces
// (wrapped in concrete use-case classes inside buildSut)
// ---------------------------------------------------------------------------
class FakeBankDetector implements IBankDetector {
  failWith?: BancoNoReconocidoError;
  async detect(): Promise<Result<DetectedBank, BancoNoReconocidoError>> {
    if (this.failWith) return Result.fail(this.failWith);
    return Result.ok(BANCO);
  }
}

class FakeNoPdfBankDetector implements IPdfBankDetector {
  async detect(): Promise<Result<DetectedBank, any>> {
    return Result.ok(BANCO);
  }
}

class FakeStructureValidator implements IStructureValidator {
  estructura: ValidatedStructure = ESTRUCTURA;
  failWith?: any;
  async validate(): Promise<Result<ValidatedStructure, any>> {
    if (this.failWith) return Result.fail(this.failWith);
    return Result.ok(this.estructura);
  }
}

class FakePdfStructureValidator implements IPdfStructureValidator {
  async validate(): Promise<Result<EstructuraPdfValidada, any>> {
    return Result.ok(ESTRUCTURA_PDF);
  }
}

class FakeTransactionNormalizer implements ITransactionNormalizer {
  transacciones: ReadonlyArray<Transaccion> = TXS;
  failWith?: NormalizacionInvalidaError;
  async normalize(): Promise<Result<ReadonlyArray<Transaccion>, any>> {
    if (this.failWith) return Result.fail(this.failWith);
    return Result.ok(this.transacciones);
  }
}

class FakePdfTransactionNormalizer implements IPdfTransactionNormalizer {
  async normalize(): Promise<Result<ReadonlyArray<Transaccion>, any>> {
    return Result.ok(TXS);
  }
}

// ---------------------------------------------------------------------------
// Fakes: account repository
// ---------------------------------------------------------------------------
class FakeAccountRepository implements IAccountRepository {
  called = false;
  failWith?: PersistenciaFallidaError;
  async ensure(): Promise<
    Result<{ accountId: string }, PersistenciaFallidaError>
  > {
    this.called = true;
    if (this.failWith) return Result.fail(this.failWith);
    return Result.ok({ accountId: ACCOUNT_ID });
  }
}

// ---------------------------------------------------------------------------
// Fakes: transaccion existente reader (for dedup)
// ---------------------------------------------------------------------------
class FakeTransaccionExistenteReader implements ITransaccionExistenteReader {
  existentes: TransaccionExistente[] = [];
  async buscarPorCuentaYRango(): Promise<
    Result<TransaccionExistente[], PersistenciaFallidaError>
  > {
    return Result.ok(this.existentes);
  }
}

// ---------------------------------------------------------------------------
// Fakes: catalogo and categoria repo
// ---------------------------------------------------------------------------
class FakeCatalogoClasificacion implements ICatalogoClasificacion {
  failWith?: CategorizacionFallidaError;
  async findAll(): Promise<Result<any, CategorizacionFallidaError>> {
    if (this.failWith) return Result.fail(this.failWith);
    return Result.ok([]); // empty patterns → auto-classify to SinCategoria
  }
}

class FakeCategoriaRepository implements ICategoriaRepository {
  categorias: CategoriaConPatrones[] = [];
  throwWith?: Error;

  async listarConPatrones(): Promise<CategoriaConPatrones[]> {
    if (this.throwWith) throw this.throwWith;
    return this.categorias;
  }
  async buscarPorId(): Promise<CategoriaConPatrones | null> {
    return null;
  }
  async existeNombre(): Promise<boolean> {
    return false;
  }
  async crear(): Promise<CategoriaConPatrones> {
    throw new Error('not implemented in fake');
  }
  async actualizar(): Promise<CategoriaConPatrones> {
    throw new Error('not implemented in fake');
  }
  async eliminar(): Promise<Result<void, CategoriaNoEncontradaError>> {
    return Result.ok(undefined);
  }
}

// ---------------------------------------------------------------------------
// Fake: FALLIDA writer
// ---------------------------------------------------------------------------
class FakeFallidaWriter implements IRegistrarIngestaFallidaWriter {
  calls: Array<{ userId: string; nombreArchivo: string; motivo: string }> = [];
  async registrar(input: {
    userId: string;
    nombreArchivo: string;
    motivo: string;
  }): Promise<Result<void, PersistenciaFallidaError>> {
    this.calls.push(input);
    return Result.ok(undefined);
  }
}

// ---------------------------------------------------------------------------
// Fake: IIngestaRepository — records calls to persistirProcesada
// ---------------------------------------------------------------------------
class FakeIngestaRepository implements IIngestaRepository {
  calls: CrearIngestaProcesadaInput[] = [];
  failWith?: PersistenciaFallidaError;
  async persistirProcesada(
    input: CrearIngestaProcesadaInput,
  ): Promise<
    Result<{ ingestaId: string; total: number }, PersistenciaFallidaError>
  > {
    if (this.failWith) return Result.fail(this.failWith);
    this.calls.push(input);
    return Result.ok({
      ingestaId: INGESTA_ID,
      total: input.transacciones.length,
    });
  }
}

// ---------------------------------------------------------------------------
// Helper: CategoriaConPatrones factory
// ---------------------------------------------------------------------------
function makeCategoria(
  id: string,
  bucket: Bucket,
  patrones: CategoriaConPatrones['patrones'] = [],
): CategoriaConPatrones {
  return {
    id,
    nombre: `Categoria ${id}`,
    bucket,
    patrones,
    transaccionesCount: 0,
  };
}

// ---------------------------------------------------------------------------
// Helper: build the SUT — fakes wrapped in concrete use-case wrappers (D-01)
// ---------------------------------------------------------------------------
interface BuildOptions {
  bankDetector?: FakeBankDetector;
  normalizer?: FakeTransactionNormalizer;
  structureValidator?: FakeStructureValidator;
  accountRepo?: FakeAccountRepository;
  txExistenteReader?: FakeTransaccionExistenteReader;
  catalogoClasificacion?: FakeCatalogoClasificacion;
  categoriaRepo?: FakeCategoriaRepository;
  ingestaRepo?: FakeIngestaRepository;
  fallidaWriter?: FakeFallidaWriter;
}

function buildSut(opts: BuildOptions = {}) {
  const logger = new NoOpLogger();
  const bankDetector = opts.bankDetector ?? new FakeBankDetector();
  const normalizer = opts.normalizer ?? new FakeTransactionNormalizer();
  const structureValidator =
    opts.structureValidator ?? new FakeStructureValidator();
  const accountRepo = opts.accountRepo ?? new FakeAccountRepository();
  const txExistenteReader =
    opts.txExistenteReader ?? new FakeTransaccionExistenteReader();
  const catalogoClasificacion =
    opts.catalogoClasificacion ?? new FakeCatalogoClasificacion();
  const categoriaRepo = opts.categoriaRepo ?? new FakeCategoriaRepository();
  const ingestaRepo = opts.ingestaRepo ?? new FakeIngestaRepository();
  const fallidaWriter = opts.fallidaWriter ?? new FakeFallidaWriter();

  // Wrap port-interface fakes in their concrete use-case classes (same pattern as
  // preview-ingesta.use-case.spec.ts — the pipeline constructor takes concrete classes)
  const pipeline = new EjecutarPipelineIngestaUseCase(
    new IngestFileUseCase(logger),
    new DetectBankUseCase(bankDetector, logger),
    new DetectPdfBankUseCase(new FakeNoPdfBankDetector(), logger),
    new ValidateStructureUseCase(structureValidator, logger),
    new ValidatePdfStructureUseCase(new FakePdfStructureValidator(), logger),
    new NormalizeTransactionsUseCase(normalizer, logger),
    new NormalizePdfTransactionsUseCase(
      new FakePdfTransactionNormalizer(),
      logger,
    ),
    logger,
  );

  const detectarDuplicadosUseCase = new DetectarDuplicadosUseCase(
    txExistenteReader,
    logger,
  );
  const categorizarTransaccionUseCase = new CategorizarTransaccionUseCase(
    logger,
  );
  const persistTransactionsUseCase = new PersistTransactionsUseCase(
    ingestaRepo,
    logger,
  );

  const sut = new CommitIngestaUseCase(
    pipeline,
    accountRepo,
    detectarDuplicadosUseCase,
    catalogoClasificacion,
    categoriaRepo,
    categorizarTransaccionUseCase,
    persistTransactionsUseCase,
    fallidaWriter,
    logger,
  );

  return {
    sut,
    accountRepo,
    txExistenteReader,
    catalogoClasificacion,
    categoriaRepo,
    ingestaRepo,
    fallidaWriter,
  };
}

const FILE_READER = new FakeFileReader();
const NO_EDITS: CommitEdit[] = [];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CommitIngestaUseCase', () => {
  // --------------------------------------------------------------------------
  // (a) Overlay applied PRE-PERSIST — bucket domain enum, FK resolved by adapter
  // --------------------------------------------------------------------------
  describe('(a) overlay applied pre-persist', () => {
    it('persists rows with correct bucket domain enum; overlay row uses mapped bucket', async () => {
      const categoriaRepo = new FakeCategoriaRepository();
      categoriaRepo.categorias = [
        makeCategoria(CAT_NECESIDADES_ID, Bucket.Necesidades),
      ];
      const ingestaRepo = new FakeIngestaRepository();
      const { sut } = buildSut({ categoriaRepo, ingestaRepo });

      const edits: CommitEdit[] = [
        { rowIndex: 0, categoriaId: CAT_NECESIDADES_ID },
      ];
      const result = await sut.execute({
        fileReader: FILE_READER,
        userId: USUARIO_ID,
        edits,
      });

      expect(result.isOk()).toBe(true);
      expect(ingestaRepo.calls).toHaveLength(1);
      const txs = ingestaRepo.calls[0].transacciones;
      // TX0 (index 0) — overlay applies Necesidades via the Map
      expect(txs[0].bucket).toBe(Bucket.Necesidades);
      expect(txs[0].categoriaId).toBe(CAT_NECESIDADES_ID);
      // TX1 (index 1) — no overlay, no pattern → SinCategoria (commit always resolves, D-11/j)
      expect(txs[1].bucket).toBe(Bucket.SinCategoria);
      expect(txs[1].categoriaId).toBeNull();
      // TX2 (index 2) — Ingreso rule (abono>0, cargo===0); no overlay
      expect(txs[2].bucket).toBe(Bucket.Ingreso);
      expect(txs[2].categoriaId).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // (b) Overlay bucket from listarConPatrones map — NOT re-classification
  // --------------------------------------------------------------------------
  describe('(b) overlay bucket from listarConPatrones map (D-15)', () => {
    it('uses categoria bucket from the Map, not auto-classification', async () => {
      const categoriaRepo = new FakeCategoriaRepository();
      categoriaRepo.categorias = [makeCategoria(CAT_AHORRO_ID, Bucket.Ahorro)];
      const ingestaRepo = new FakeIngestaRepository();
      const { sut } = buildSut({ categoriaRepo, ingestaRepo });

      // TX0 would auto-classify to SinCategoria; overlay assigns cat-ahorro → Ahorro bucket
      const edits: CommitEdit[] = [{ rowIndex: 0, categoriaId: CAT_AHORRO_ID }];
      const result = await sut.execute({
        fileReader: FILE_READER,
        userId: USUARIO_ID,
        edits,
      });

      expect(result.isOk()).toBe(true);
      const txs = ingestaRepo.calls[0].transacciones;
      expect(txs[0].bucket).toBe(Bucket.Ahorro);
      expect(txs[0].categoriaId).toBe(CAT_AHORRO_ID);
    });
  });

  // --------------------------------------------------------------------------
  // (c) rowIndex validation — BEFORE classification; out-of-range → 400
  // --------------------------------------------------------------------------
  describe('(c) rowIndex validation (D-04/5a)', () => {
    it('out-of-range rowIndex → RowIndexFueraDeRangoError; nothing persisted', async () => {
      const ingestaRepo = new FakeIngestaRepository();
      const { sut } = buildSut({ ingestaRepo });

      // TXS has 3 rows (0,1,2); rowIndex=15 is out-of-range
      const edits: CommitEdit[] = [{ rowIndex: 15, categoriaId: null }];
      const result = await sut.execute({
        fileReader: FILE_READER,
        userId: USUARIO_ID,
        edits,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(RowIndexFueraDeRangoError);
      expect(ingestaRepo.calls).toHaveLength(0);
    });

    it('duplicate rowIndex in overlay → RowIndexFueraDeRangoError with causa=duplicado', async () => {
      const ingestaRepo = new FakeIngestaRepository();
      const { sut } = buildSut({ ingestaRepo });

      const edits: CommitEdit[] = [
        { rowIndex: 0, categoriaId: null },
        { rowIndex: 0, categoriaId: null }, // duplicate
      ];
      const result = await sut.execute({
        fileReader: FILE_READER,
        userId: USUARIO_ID,
        edits,
      });

      expect(result.isFail()).toBe(true);
      const error = result.getError() as RowIndexFueraDeRangoError;
      expect(error).toBeInstanceOf(RowIndexFueraDeRangoError);
      expect(error.causa).toBe('duplicado');
      expect(ingestaRepo.calls).toHaveLength(0);
    });

    it('rowIndex validated against pre-dedup filas.length, not nuevas.length (D-11a)', async () => {
      // TX0 is a duplicate at commit time — rowIndex=0 is still in [0, filas.length=3)
      // So the overlay for rowIndex=0 must NOT produce RowIndexFueraDeRangoError.
      // The in-range-but-duplicate entry is silently dropped (D-11a).
      const txExistenteReader = new FakeTransaccionExistenteReader();
      txExistenteReader.existentes = [
        {
          fecha: TX0.fecha,
          descripcion: TX0.descripcion,
          cargo: TX0.cargo,
          abono: TX0.abono,
        },
      ];
      const ingestaRepo = new FakeIngestaRepository();
      const { sut } = buildSut({ txExistenteReader, ingestaRepo });

      // rowIndex=0 is in-range for filas (length=3), though TX0 is a duplicate
      const edits: CommitEdit[] = [{ rowIndex: 0, categoriaId: null }];
      const result = await sut.execute({
        fileReader: FILE_READER,
        userId: USUARIO_ID,
        edits,
      });

      // Must succeed (in-range duplicate overlay silently dropped — D-11a)
      expect(result.isOk()).toBe(true);
      // TX0 was omitted as dup; only TX1+TX2 persist
      expect(ingestaRepo.calls[0].transacciones).toHaveLength(2);
    });
  });

  // --------------------------------------------------------------------------
  // (d) Cross-tenant categoriaId rejection (CMT-03, D-10, RNF-SEC-006)
  // --------------------------------------------------------------------------
  describe('(d) cross-tenant categoriaId rejection', () => {
    it('categoriaId not in listarConPatrones set → CategoriaFueraDeCatalogoError; nothing persisted', async () => {
      const categoriaRepo = new FakeCategoriaRepository();
      categoriaRepo.categorias = [
        makeCategoria(CAT_NECESIDADES_ID, Bucket.Necesidades),
      ];
      const ingestaRepo = new FakeIngestaRepository();
      const { sut } = buildSut({ categoriaRepo, ingestaRepo });

      const edits: CommitEdit[] = [
        { rowIndex: 0, categoriaId: 'cat-other-user-xyz' },
      ];
      const result = await sut.execute({
        fileReader: FILE_READER,
        userId: USUARIO_ID,
        edits,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CategoriaFueraDeCatalogoError);
      expect(ingestaRepo.calls).toHaveLength(0);
    });

    it('pattern-less own categoria (in listarConPatrones but not in findAll) is accepted (D-10)', async () => {
      // cat-sin-patron has no patterns — it IS in listarConPatrones but NOT visible to findAll
      const categoriaRepo = new FakeCategoriaRepository();
      categoriaRepo.categorias = [
        makeCategoria(CAT_SIN_PATRON_ID, Bucket.Ahorro, []),
      ];
      const catalogoClasificacion = new FakeCatalogoClasificacion();
      // findAll returns empty (no patterns) — but the categoria IS in listarConPatrones
      const ingestaRepo = new FakeIngestaRepository();
      const { sut } = buildSut({
        categoriaRepo,
        catalogoClasificacion,
        ingestaRepo,
      });

      const edits: CommitEdit[] = [
        { rowIndex: 0, categoriaId: CAT_SIN_PATRON_ID },
      ];
      const result = await sut.execute({
        fileReader: FILE_READER,
        userId: USUARIO_ID,
        edits,
      });

      expect(result.isOk()).toBe(true); // accepted — own categoria
      expect(ingestaRepo.calls[0].transacciones[0].categoriaId).toBe(
        CAT_SIN_PATRON_ID,
      );
    });

    it('null categoriaId in overlay is always valid (no cross-tenant risk)', async () => {
      const ingestaRepo = new FakeIngestaRepository();
      const { sut } = buildSut({ ingestaRepo });

      const edits: CommitEdit[] = [{ rowIndex: 0, categoriaId: null }];
      const result = await sut.execute({
        fileReader: FILE_READER,
        userId: USUARIO_ID,
        edits,
      });

      expect(result.isOk()).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // (e) Catalog-down fail-closed — persists nothing (D-10/D-18)
  // --------------------------------------------------------------------------
  describe('(e) catalog-down fail-closed', () => {
    it('findAll failure → commit returns CategorizacionFallidaError; persistirProcesada NOT called', async () => {
      const catalogoClasificacion = new FakeCatalogoClasificacion();
      catalogoClasificacion.failWith = new CategorizacionFallidaError(
        'DB down',
      );
      const ingestaRepo = new FakeIngestaRepository();
      const { sut, fallidaWriter } = buildSut({
        catalogoClasificacion,
        ingestaRepo,
      });

      const result = await sut.execute({
        fileReader: FILE_READER,
        userId: USUARIO_ID,
        edits: NO_EDITS,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CategorizacionFallidaError);
      expect(ingestaRepo.calls).toHaveLength(0);
      expect(fallidaWriter.calls).toHaveLength(0); // NO FALLIDA (D-18)
    });

    it('listarConPatrones throws → PersistenciaFallidaError; nothing persisted; NO FALLIDA', async () => {
      const categoriaRepo = new FakeCategoriaRepository();
      categoriaRepo.throwWith = new Error('Unexpected DB connection error');
      const ingestaRepo = new FakeIngestaRepository();
      const { sut, fallidaWriter } = buildSut({ categoriaRepo, ingestaRepo });

      const result = await sut.execute({
        fileReader: FILE_READER,
        userId: USUARIO_ID,
        edits: NO_EDITS,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PersistenciaFallidaError);
      expect(ingestaRepo.calls).toHaveLength(0);
      expect(fallidaWriter.calls).toHaveLength(0); // NO FALLIDA (D-18 inner layer)
    });
  });

  // --------------------------------------------------------------------------
  // (f) Dedup at commit — omit + count; never aborts (CMT-02)
  // --------------------------------------------------------------------------
  describe('(f) dedup at commit — omit + count (CMT-02)', () => {
    it('duplicate rows omitted; non-duplicate rows persist; duplicadosOmitidos reported', async () => {
      const txExistenteReader = new FakeTransaccionExistenteReader();
      txExistenteReader.existentes = [
        {
          fecha: TX0.fecha,
          descripcion: TX0.descripcion,
          cargo: TX0.cargo,
          abono: TX0.abono,
        },
      ];
      const ingestaRepo = new FakeIngestaRepository();
      const { sut } = buildSut({ txExistenteReader, ingestaRepo });

      const result = await sut.execute({
        fileReader: FILE_READER,
        userId: USUARIO_ID,
        edits: NO_EDITS,
      });

      expect(result.isOk()).toBe(true);
      const commitResult = result.getValue();
      expect(commitResult.duplicadosOmitidos).toBe(1);
      expect(commitResult.totalTransacciones).toBe(2); // TX1 + TX2
      expect(ingestaRepo.calls[0].transacciones).toHaveLength(2);
    });

    it('all rows duplicate at commit — succeeds with totalTransacciones: 0', async () => {
      const txExistenteReader = new FakeTransaccionExistenteReader();
      txExistenteReader.existentes = TXS.map((tx) => ({
        fecha: tx.fecha,
        descripcion: tx.descripcion,
        cargo: tx.cargo,
        abono: tx.abono,
      }));
      const ingestaRepo = new FakeIngestaRepository();
      const { sut } = buildSut({ txExistenteReader, ingestaRepo });

      const result = await sut.execute({
        fileReader: FILE_READER,
        userId: USUARIO_ID,
        edits: NO_EDITS,
      });

      expect(result.isOk()).toBe(true);
      const commitResult = result.getValue();
      expect(commitResult.duplicadosOmitidos).toBe(3);
      expect(commitResult.totalTransacciones).toBe(0);
      // persistirProcesada must still be called (with empty transacciones)
      expect(ingestaRepo.calls).toHaveLength(1);
    });
  });

  // --------------------------------------------------------------------------
  // (g) ensure() called by CommitIngestaUseCase; FALLIDA semantics (D-01/D-18)
  // --------------------------------------------------------------------------
  describe('(g) ensure() + FALLIDA semantics', () => {
    it('ensure() is called once per commit execution', async () => {
      const accountRepo = new FakeAccountRepository();
      const { sut } = buildSut({ accountRepo });

      await sut.execute({
        fileReader: FILE_READER,
        userId: USUARIO_ID,
        edits: NO_EDITS,
      });

      expect(accountRepo.called).toBe(true);
    });

    it('pipeline failure (BancoNoReconocidoError) → FALLIDA registered with nombreArchivo', async () => {
      const bankDetector = new FakeBankDetector();
      bankDetector.failWith = new BancoNoReconocidoError('cartola.xlsx');
      const fallidaWriter = new FakeFallidaWriter();
      const { sut } = buildSut({ bankDetector, fallidaWriter });

      const result = await sut.execute({
        fileReader: FILE_READER,
        userId: USUARIO_ID,
        edits: NO_EDITS,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(BancoNoReconocidoError);
      expect(fallidaWriter.calls).toHaveLength(1);
      expect(fallidaWriter.calls[0].nombreArchivo).toBe('cartola.xlsx');
      expect(fallidaWriter.calls[0].userId).toBe(USUARIO_ID);
    });

    it('pipeline failure (NormalizacionInvalidaError) → FALLIDA registered', async () => {
      const normalizer = new FakeTransactionNormalizer();
      normalizer.failWith = new NormalizacionInvalidaError('BancoEstado', [
        { tipo: 'FilaSinMontos', fila: 1 },
      ]);
      const fallidaWriter = new FakeFallidaWriter();
      const { sut } = buildSut({ normalizer, fallidaWriter });

      const result = await sut.execute({
        fileReader: FILE_READER,
        userId: USUARIO_ID,
        edits: NO_EDITS,
      });

      expect(result.isFail()).toBe(true);
      expect(fallidaWriter.calls).toHaveLength(1);
    });

    it('overlay-validation 400 (RowIndexFueraDeRangoError) → FALLIDA NOT registered', async () => {
      const fallidaWriter = new FakeFallidaWriter();
      const { sut } = buildSut({ fallidaWriter });

      const edits: CommitEdit[] = [{ rowIndex: 999, categoriaId: null }];
      const result = await sut.execute({
        fileReader: FILE_READER,
        userId: USUARIO_ID,
        edits,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(RowIndexFueraDeRangoError);
      expect(fallidaWriter.calls).toHaveLength(0); // NO FALLIDA
    });

    it('cross-tenant rejection (CategoriaFueraDeCatalogoError) → FALLIDA NOT registered', async () => {
      const categoriaRepo = new FakeCategoriaRepository();
      categoriaRepo.categorias = []; // no own categories
      const fallidaWriter = new FakeFallidaWriter();
      const { sut } = buildSut({ categoriaRepo, fallidaWriter });

      const edits: CommitEdit[] = [
        { rowIndex: 0, categoriaId: 'cat-other-user' },
      ];
      const result = await sut.execute({
        fileReader: FILE_READER,
        userId: USUARIO_ID,
        edits,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CategoriaFueraDeCatalogoError);
      expect(fallidaWriter.calls).toHaveLength(0);
    });

    it('catalog-down → FALLIDA NOT registered', async () => {
      const catalogoClasificacion = new FakeCatalogoClasificacion();
      catalogoClasificacion.failWith = new CategorizacionFallidaError(
        'DB error',
      );
      const fallidaWriter = new FakeFallidaWriter();
      const { sut } = buildSut({ catalogoClasificacion, fallidaWriter });

      await sut.execute({
        fileReader: FILE_READER,
        userId: USUARIO_ID,
        edits: NO_EDITS,
      });

      expect(fallidaWriter.calls).toHaveLength(0); // NO FALLIDA
    });
  });

  // --------------------------------------------------------------------------
  // (h) Never throws — always returns Result (D-18)
  // --------------------------------------------------------------------------
  describe('(h) never throws', () => {
    it('persist failure → returns Result.fail, does not throw', async () => {
      const ingestaRepo = new FakeIngestaRepository();
      ingestaRepo.failWith = new PersistenciaFallidaError('DB connection lost');
      const { sut } = buildSut({ ingestaRepo });

      // Must not throw; must return a Result
      const result = await sut.execute({
        fileReader: FILE_READER,
        userId: USUARIO_ID,
        edits: NO_EDITS,
      });
      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PersistenciaFallidaError);
    });
  });

  // --------------------------------------------------------------------------
  // (i) CommitIngestaResult.transacciones from pre-persist retained array (§5.2b)
  // --------------------------------------------------------------------------
  describe('(i) transacciones from pre-persist retained array', () => {
    it('result.transacciones carries correct fields for all rows', async () => {
      const categoriaRepo = new FakeCategoriaRepository();
      categoriaRepo.categorias = [
        makeCategoria(CAT_NECESIDADES_ID, Bucket.Necesidades),
      ];
      const ingestaRepo = new FakeIngestaRepository();
      const { sut } = buildSut({ categoriaRepo, ingestaRepo });

      const edits: CommitEdit[] = [
        { rowIndex: 0, categoriaId: CAT_NECESIDADES_ID },
      ];
      const result = await sut.execute({
        fileReader: FILE_READER,
        userId: USUARIO_ID,
        edits,
      });

      expect(result.isOk()).toBe(true);
      const { transacciones } = result.getValue();
      expect(transacciones).toHaveLength(3); // all TXS (no duplicates)

      // TX0 — overlaid to Necesidades
      expect(transacciones[0].bucket).toBe(Bucket.Necesidades);
      expect(transacciones[0].categoriaId).toBe(CAT_NECESIDADES_ID);
      expect(typeof transacciones[0].cargo).toBe('bigint');
      expect(typeof transacciones[0].abono).toBe('bigint');

      // TX2 — Ingreso rule
      expect(transacciones[2].bucket).toBe(Bucket.Ingreso);
      expect(transacciones[2].categoriaId).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // (j) SinCategoria rows persist bucket: Bucket.SinCategoria (NOT null) (D-11/j)
  // --------------------------------------------------------------------------
  describe('(j) SinCategoria persists real FK, not null', () => {
    it('unmatched non-Ingreso rows persist bucket: Bucket.SinCategoria (commit never produces bucketId: null)', async () => {
      const ingestaRepo = new FakeIngestaRepository();
      const { sut } = buildSut({ ingestaRepo });

      // TX0 and TX1 have no patterns → SinCategoria; TX2 is Ingreso
      const result = await sut.execute({
        fileReader: FILE_READER,
        userId: USUARIO_ID,
        edits: NO_EDITS,
      });

      expect(result.isOk()).toBe(true);
      const txs = ingestaRepo.calls[0].transacciones;
      // TX0 — SinCategoria (not null — commit resolves pre-persist)
      expect(txs[0].bucket).toBe(Bucket.SinCategoria);
      expect(txs[0].bucket).not.toBeNull();
      // TX1 — SinCategoria
      expect(txs[1].bucket).toBe(Bucket.SinCategoria);
      // TX2 — Ingreso
      expect(txs[2].bucket).toBe(Bucket.Ingreso);
    });
  });

  // --------------------------------------------------------------------------
  // CommitIngestaResult fields (CMT-05)
  // --------------------------------------------------------------------------
  describe('CommitIngestaResult shape (CMT-05)', () => {
    it('carries ingestaId, totalTransacciones, duplicadosOmitidos, transacciones[]', async () => {
      const ingestaRepo = new FakeIngestaRepository();
      const { sut } = buildSut({ ingestaRepo });

      const result = await sut.execute({
        fileReader: FILE_READER,
        userId: USUARIO_ID,
        edits: NO_EDITS,
      });

      expect(result.isOk()).toBe(true);
      const {
        ingestaId,
        totalTransacciones,
        duplicadosOmitidos,
        transacciones,
      } = result.getValue();
      expect(ingestaId).toBe(INGESTA_ID);
      expect(totalTransacciones).toBe(3);
      expect(duplicadosOmitidos).toBe(0);
      expect(transacciones).toHaveLength(3);
    });
  });

  // --------------------------------------------------------------------------
  // Amounts scrubbed from error messages (ADR-013)
  // --------------------------------------------------------------------------
  describe('amounts scrubbed from error messages (ADR-013)', () => {
    it('RowIndexFueraDeRangoError message contains no transaction amount data', async () => {
      const { sut } = buildSut({});
      const edits: CommitEdit[] = [{ rowIndex: 99, categoriaId: null }];
      const result = await sut.execute({
        fileReader: FILE_READER,
        userId: USUARIO_ID,
        edits,
      });

      expect(result.isFail()).toBe(true);
      const msg = result.getError().message;
      // Raw transaction amounts (15000, 10000, 500000) must NOT appear
      expect(msg).not.toContain('15000');
      expect(msg).not.toContain('10000');
      expect(msg).not.toContain('500000');
    });

    it('CategoriaFueraDeCatalogoError message contains no transaction amount data', async () => {
      const categoriaRepo = new FakeCategoriaRepository();
      categoriaRepo.categorias = [];
      const { sut } = buildSut({ categoriaRepo });
      const edits: CommitEdit[] = [
        { rowIndex: 0, categoriaId: 'cat-external' },
      ];
      const result = await sut.execute({
        fileReader: FILE_READER,
        userId: USUARIO_ID,
        edits,
      });

      expect(result.isFail()).toBe(true);
      const msg = result.getError().message;
      expect(msg).not.toContain('15000');
    });
  });
});
