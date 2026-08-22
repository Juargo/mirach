import { PreviewIngestaUseCase } from './preview-ingesta.use-case';
import { EjecutarPipelineIngestaUseCase } from './ejecutar-pipeline-ingesta.use-case';
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
import { PatronClasificacion } from '../../domain/value-objects/patron-clasificacion';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';
import { CategorizacionFallidaError } from '../../domain/errors/categorizacion-fallida.error';
import { ExtensionNoPermitidaError } from '../../domain/errors/extension-no-permitida.error';
import { BancoNoReconocidoError } from '../../domain/errors/banco-no-reconocido.error';
import { EstructuraInvalidaError } from '../../domain/errors/estructura-invalida.error';
import { NormalizacionInvalidaError } from '../../domain/errors/normalizacion-invalida.error';
import { PdfInvalidoError } from '../../domain/errors/pdf-invalido.error';
import { PdfSinTextoError } from '../../domain/errors/pdf-sin-texto.error';
import { EstructuraPdfInvalidaError } from '../../domain/errors/estructura-pdf-invalida.error';
import { RangoFechasInvalidoError } from '../../domain/errors/rango-fechas-invalido.error';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../domain/value-objects/tipo-cuenta';
import { IFileReader } from '../ports/file-reader.port';
import { IBankDetector, DetectedBank } from '../ports/bank-detector.port';
import { IPdfBankDetector } from '../ports/pdf-bank-detector.port';
import {
  IStructureValidator,
  ValidatedStructure,
} from '../ports/structure-validator.port';
import {
  IPdfStructureValidator,
  EstructuraPdfValidada,
} from '../ports/pdf-structure-validator.port';
import { ITransactionNormalizer } from '../ports/transaction-normalizer.port';
import { IPdfTransactionNormalizer } from '../ports/pdf-transaction-normalizer.port';
import { IAccountReader } from '../ports/account-reader.port';
import {
  ITransaccionExistenteReader,
  TransaccionExistente,
} from '../ports/transaccion-existente-reader.port';
import { ICatalogoClasificacion } from '../ports/catalogo-clasificacion.port';
import { NoOpLogger, FakeLogger } from '../../../test/support/logger.double';

// ---------------------------------------------------------------------------
// File reader fake
// ---------------------------------------------------------------------------
class FakeFileReader implements IFileReader {
  constructor(
    private readonly buffer = Buffer.from('contenido'),
    private readonly originalName = 'movimientos.xlsx',
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

// ---------------------------------------------------------------------------
// Pipeline fakes
// ---------------------------------------------------------------------------
const BANCO: DetectedBank = {
  banco: BancoConocido.BancoEstado,
  tipoCuenta: TipoCuentaConocido.CuentaRut,
  numeroCuenta: '111222333',
};

class FakeBankDetector implements IBankDetector {
  called = false;
  failWith?: BancoNoReconocidoError;
  throwWith?: Error;
  async detect(): Promise<Result<DetectedBank, BancoNoReconocidoError>> {
    this.called = true;
    if (this.throwWith) throw this.throwWith;
    if (this.failWith) return Result.fail(this.failWith);
    return Result.ok(BANCO);
  }
}

const ESTRUCTURA: ValidatedStructure = {
  banco: BancoConocido.BancoEstado,
  filaEncabezados: 1,
  primeraFilaDatos: 2,
  totalFilasDatos: 2,
};

class FakeStructureValidator implements IStructureValidator {
  called = false;
  failWith?: EstructuraInvalidaError;
  /** Overridable so tests can force estructura.totalFilasDatos to diverge from the normalized row count. */
  estructura: ValidatedStructure = ESTRUCTURA;
  async validate(): Promise<
    Result<ValidatedStructure, EstructuraInvalidaError>
  > {
    this.called = true;
    if (this.failWith) return Result.fail(this.failWith);
    return Result.ok(this.estructura);
  }
}

function crearTxs(cantidad: number): Transaccion[] {
  return Array.from({ length: cantidad }, (_, i) =>
    Transaccion.crear({
      fecha: new Date('2026-05-14T00:00:00.000Z'),
      descripcion: `Movimiento ${i}`,
      cargo: BigInt(i + 1),
      abono: 0n,
    }).getValue(),
  );
}

const TXS: Transaccion[] = crearTxs(2);

class FakeTransactionNormalizer implements ITransactionNormalizer {
  called = false;
  failWith?: NormalizacionInvalidaError;
  transacciones: ReadonlyArray<Transaccion> = TXS;
  async normalize(): Promise<
    Result<ReadonlyArray<Transaccion>, NormalizacionInvalidaError>
  > {
    this.called = true;
    if (this.failWith) return Result.fail(this.failWith);
    return Result.ok(this.transacciones);
  }
}

class FakePdfBankDetector implements IPdfBankDetector {
  called = false;
  failWith?: PdfInvalidoError | BancoNoReconocidoError | PdfSinTextoError;
  async detect(): Promise<
    Result<
      DetectedBank,
      PdfInvalidoError | BancoNoReconocidoError | PdfSinTextoError
    >
  > {
    this.called = true;
    if (this.failWith) return Result.fail(this.failWith);
    return Result.ok(BANCO);
  }
}

const ESTRUCTURA_PDF: EstructuraPdfValidada = {
  banco: BancoConocido.BancoEstado,
  paginaInicioTabla: 1,
  rangosX: [],
  toleranciaY: 2,
};

class FakePdfStructureValidator implements IPdfStructureValidator {
  called = false;
  failWith?: EstructuraPdfInvalidaError | RangoFechasInvalidoError;
  async validate(): Promise<
    Result<
      EstructuraPdfValidada,
      EstructuraPdfInvalidaError | RangoFechasInvalidoError
    >
  > {
    this.called = true;
    if (this.failWith) return Result.fail(this.failWith);
    return Result.ok(ESTRUCTURA_PDF);
  }
}

const TXS_PDF: Transaccion[] = [
  Transaccion.crear({
    fecha: new Date('2026-04-20T00:00:00.000Z'),
    descripcion: 'Compra PDF',
    cargo: 9000n,
    abono: 0n,
  }).getValue(),
];

class FakePdfTransactionNormalizer implements IPdfTransactionNormalizer {
  called = false;
  failWith?: EstructuraPdfInvalidaError;
  transacciones: ReadonlyArray<Transaccion> = TXS_PDF;
  async normalize(): Promise<
    Result<ReadonlyArray<Transaccion>, EstructuraPdfInvalidaError>
  > {
    this.called = true;
    if (this.failWith) return Result.fail(this.failWith);
    return Result.ok(this.transacciones);
  }
}

// ---------------------------------------------------------------------------
// Dedup / catalog fakes
// ---------------------------------------------------------------------------

/** IAccountReader fake (D-05). Returns accountId by default; null simulates unknown account. */
class FakeAccountReader implements IAccountReader {
  accountId: string | null = 'acc-1';
  failWith?: PersistenciaFallidaError;
  called = false;

  async findByBanco(): Promise<
    Result<{ accountId: string } | null, PersistenciaFallidaError>
  > {
    this.called = true;
    if (this.failWith) return Result.fail(this.failWith);
    return Result.ok(
      this.accountId !== null ? { accountId: this.accountId } : null,
    );
  }
}

class FakeTransaccionExistenteReader implements ITransaccionExistenteReader {
  existentes: ReadonlyArray<TransaccionExistente> = [];
  failWith?: PersistenciaFallidaError;
  called = false;

  async buscarPorCuentaYRango(): Promise<
    Result<ReadonlyArray<TransaccionExistente>, PersistenciaFallidaError>
  > {
    this.called = true;
    if (this.failWith) return Result.fail(this.failWith);
    return Result.ok(this.existentes);
  }
}

class FakeCatalogo implements ICatalogoClasificacion {
  patrones: ReadonlyArray<PatronClasificacion> = [];
  failWith?: CategorizacionFallidaError;

  async findAll(): Promise<
    Result<ReadonlyArray<PatronClasificacion>, CategorizacionFallidaError>
  > {
    if (this.failWith) return Result.fail(this.failWith);
    return Result.ok(this.patrones);
  }
}

// ---------------------------------------------------------------------------
// Build helper
// ---------------------------------------------------------------------------
const USER_ID = 'usuario-preview-test';

interface BuildOptions {
  pdfBankDetector?: FakePdfBankDetector;
  pdfStructureValidator?: FakePdfStructureValidator;
  pdfNormalizer?: FakePdfTransactionNormalizer;
  normalizer?: FakeTransactionNormalizer;
  structureValidator?: FakeStructureValidator;
  accountReader?: FakeAccountReader;
  txExistenteReader?: FakeTransaccionExistenteReader;
  catalogo?: FakeCatalogo;
}

function buildUseCase(opts?: BuildOptions) {
  const bankDetector = new FakeBankDetector();
  const structureValidator =
    opts?.structureValidator ?? new FakeStructureValidator();
  const normalizer = opts?.normalizer ?? new FakeTransactionNormalizer();
  const pdfBankDetector = opts?.pdfBankDetector ?? new FakePdfBankDetector();
  const pdfStructureValidator =
    opts?.pdfStructureValidator ?? new FakePdfStructureValidator();
  const pdfNormalizer =
    opts?.pdfNormalizer ?? new FakePdfTransactionNormalizer();
  const accountReader = opts?.accountReader ?? new FakeAccountReader();
  const txExistenteReader =
    opts?.txExistenteReader ?? new FakeTransaccionExistenteReader();
  const catalogo = opts?.catalogo ?? new FakeCatalogo();

  // US-057 D-01: PreviewIngestaUseCase is the THIRD caller of EjecutarPipelineIngestaUseCase.
  const ejecutarPipelineUseCase = new EjecutarPipelineIngestaUseCase(
    new IngestFileUseCase(new NoOpLogger()),
    new DetectBankUseCase(bankDetector, new NoOpLogger()),
    new DetectPdfBankUseCase(pdfBankDetector, new NoOpLogger()),
    new ValidateStructureUseCase(structureValidator, new NoOpLogger()),
    new ValidatePdfStructureUseCase(pdfStructureValidator, new NoOpLogger()),
    new NormalizeTransactionsUseCase(normalizer, new NoOpLogger()),
    new NormalizePdfTransactionsUseCase(pdfNormalizer, new NoOpLogger()),
    new NoOpLogger(),
  );

  const useCase = new PreviewIngestaUseCase(
    ejecutarPipelineUseCase,
    accountReader,
    txExistenteReader,
    catalogo,
    new CategorizarTransaccionUseCase(new NoOpLogger()),
    new NoOpLogger(),
  );

  return {
    useCase,
    bankDetector,
    structureValidator,
    normalizer,
    pdfBankDetector,
    pdfStructureValidator,
    pdfNormalizer,
    accountReader,
    txExistenteReader,
    catalogo,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PreviewIngestaUseCase', () => {
  it('happy path: returns resumen + filas[] with rowIndex/esDuplicado/sugerido', async () => {
    // Happy path: account exists, no duplicates, empty catalog (SinCategoria → sugerido: null)
    const { useCase } = buildUseCase();

    const result = await useCase.execute({
      fileReader: new FakeFileReader(),
      userId: USER_ID,
    });

    expect(result.isOk()).toBe(true);
    const value = result.getValue();
    // Structural shape
    expect(Object.keys(value).sort()).toEqual(['banco', 'filas', 'resumen']);
    expect(value.banco).toEqual(BANCO);
    expect(value.resumen.totalFilas).toBe(TXS.length);
    expect(value.filas).toHaveLength(TXS.length);
    // Each fila has rowIndex, transaccion, esDuplicado, sugerido
    value.filas.forEach((fila, i) => {
      expect(fila.rowIndex).toBe(i);
      expect(fila.esDuplicado).toBe(false);
      // No catalog pattern, cargo>0 → SinCategoria → sugerido: null (D-09)
      expect(fila.sugerido).toBeNull();
    });
  });

  it('CA-04 no-write contract: constructor accepts no write-capable port (compile-time + shape check)', async () => {
    const { useCase } = buildUseCase();

    const result = await useCase.execute({
      fileReader: new FakeFileReader(),
      userId: USER_ID,
    });

    expect(result.isOk()).toBe(true);
    const value = result.getValue();
    // Shape pins the read-model: no ingestaId, no persistencia artefact
    expect(Object.keys(value).sort()).toEqual(['banco', 'filas', 'resumen']);
  });

  it('happy Excel: full pipeline runs (detect→validate→normalize) then dedup/catalog', async () => {
    const {
      useCase,
      bankDetector,
      structureValidator,
      normalizer,
      pdfBankDetector,
      pdfStructureValidator,
      pdfNormalizer,
    } = buildUseCase();

    const result = await useCase.execute({
      fileReader: new FakeFileReader(),
      userId: USER_ID,
    });

    expect(result.isOk()).toBe(true);
    const value = result.getValue();
    expect(value.banco).toEqual(BANCO);
    expect(value.resumen.totalFilas).toBe(TXS.length);

    expect(bankDetector.called).toBe(true);
    expect(structureValidator.called).toBe(true);
    expect(normalizer.called).toBe(true);
    expect(pdfBankDetector.called).toBe(false);
    expect(pdfStructureValidator.called).toBe(false);
    expect(pdfNormalizer.called).toBe(false);
  });

  it('happy PDF: invoca el trio PDF y NO el trio Excel', async () => {
    const {
      useCase,
      bankDetector,
      structureValidator,
      normalizer,
      pdfBankDetector,
      pdfStructureValidator,
      pdfNormalizer,
    } = buildUseCase();

    const result = await useCase.execute({
      fileReader: new FakeFileReader(Buffer.from('%PDF-1.4'), 'cartola.pdf'),
      userId: USER_ID,
    });

    expect(result.isOk()).toBe(true);
    const value = result.getValue();
    expect(value.filas).toHaveLength(TXS_PDF.length);
    expect(value.resumen.totalFilas).toBe(TXS_PDF.length);

    expect(pdfBankDetector.called).toBe(true);
    expect(pdfStructureValidator.called).toBe(true);
    expect(pdfNormalizer.called).toBe(true);
    expect(bankDetector.called).toBe(false);
    expect(structureValidator.called).toBe(false);
    expect(normalizer.called).toBe(false);
  });

  it('no-cap: normalize retorna 120 filas → filas tiene ALL 120, totalFilas es 120 (D-08: no 50-cap)', async () => {
    const normalizer = new FakeTransactionNormalizer();
    normalizer.transacciones = crearTxs(120);
    // Excel validator reports the same count as the normalized set (no drop).
    const structureValidator = new FakeStructureValidator();
    structureValidator.estructura = { ...ESTRUCTURA, totalFilasDatos: 120 };
    const { useCase } = buildUseCase({ normalizer, structureValidator });

    const result = await useCase.execute({
      fileReader: new FakeFileReader(),
      userId: USER_ID,
    });

    expect(result.isOk()).toBe(true);
    const value = result.getValue();
    // D-08: no server-side cap — all 120 rows returned
    expect(value.filas.length).toBe(120);
    expect(value.resumen.totalFilas).toBe(120);
  });

  it('spec PREV-EXT-01: totalFilas comes from estructura.totalFilasDatos (Excel), even when it exceeds the normalized row count', async () => {
    // Excel validator reports 5 data rows, but normalize yields only 3 (2 rows
    // dropped downstream). resumen.totalFilas MUST equal the estructura value (5),
    // while filas.length equals the normalized count (3).
    const normalizer = new FakeTransactionNormalizer();
    normalizer.transacciones = crearTxs(3);
    const structureValidator = new FakeStructureValidator();
    structureValidator.estructura = { ...ESTRUCTURA, totalFilasDatos: 5 };
    const { useCase } = buildUseCase({ normalizer, structureValidator });

    const result = await useCase.execute({
      fileReader: new FakeFileReader(),
      userId: USER_ID,
    });

    expect(result.isOk()).toBe(true);
    const value = result.getValue();
    expect(value.resumen.totalFilas).toBe(5); // from estructura, not filas.length
    expect(value.filas.length).toBe(3); // normalized rows
  });

  it('rowIndex is 0-based contiguous for all filas', async () => {
    const normalizer = new FakeTransactionNormalizer();
    normalizer.transacciones = crearTxs(5);
    const { useCase } = buildUseCase({ normalizer });

    const result = await useCase.execute({
      fileReader: new FakeFileReader(),
      userId: USER_ID,
    });

    expect(result.isOk()).toBe(true);
    result.getValue().filas.forEach((fila, i) => {
      expect(fila.rowIndex).toBe(i);
    });
  });

  it('archivo con 0 filas de datos: retorna ok con totalFilas:0 y filas:[] (200 legítimo)', async () => {
    const normalizer = new FakeTransactionNormalizer();
    normalizer.transacciones = [];
    // Structure validator also reports 0 data rows (coherent empty file).
    const structureValidator = new FakeStructureValidator();
    structureValidator.estructura = { ...ESTRUCTURA, totalFilasDatos: 0 };
    const { useCase } = buildUseCase({ normalizer, structureValidator });

    const result = await useCase.execute({
      fileReader: new FakeFileReader(),
      userId: USER_ID,
    });

    expect(result.isOk()).toBe(true);
    const value = result.getValue();
    expect(value.resumen.totalFilas).toBe(0);
    expect(value.filas).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // D-06: account not found → all esDuplicado: false, reader not queried
  // ---------------------------------------------------------------------------
  describe('D-06: findByBanco returns null → all esDuplicado: false', () => {
    it('when account does not exist, all rows have esDuplicado: false and existenteReader is not queried', async () => {
      const accountReader = new FakeAccountReader();
      accountReader.accountId = null; // account not found
      const txExistenteReader = new FakeTransaccionExistenteReader();
      const { useCase } = buildUseCase({ accountReader, txExistenteReader });

      const result = await useCase.execute({
        fileReader: new FakeFileReader(),
        userId: USER_ID,
      });

      expect(result.isOk()).toBe(true);
      const { filas } = result.getValue();
      filas.forEach((fila) => {
        expect(fila.esDuplicado).toBe(false);
      });
      // Reader must NOT be queried when account does not exist (D-06)
      expect(txExistenteReader.called).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // D-07: per-row esDuplicado mask via marcarDuplicados
  // ---------------------------------------------------------------------------
  describe('D-07: per-row esDuplicado mask', () => {
    it('partial overlap: rows matching existing transactions are marked esDuplicado: true', async () => {
      const normalizer = new FakeTransactionNormalizer();
      // TXS[0] = Movimiento 0 (cargo: 1n), TXS[1] = Movimiento 1 (cargo: 2n)
      normalizer.transacciones = TXS;

      const txExistenteReader = new FakeTransaccionExistenteReader();
      // TXS[0] exists in DB; TXS[1] is new
      txExistenteReader.existentes = [
        {
          fecha: TXS[0].fecha,
          descripcion: TXS[0].descripcion,
          cargo: TXS[0].cargo,
          abono: TXS[0].abono,
        },
      ];

      const { useCase } = buildUseCase({ normalizer, txExistenteReader });

      const result = await useCase.execute({
        fileReader: new FakeFileReader(),
        userId: USER_ID,
      });

      expect(result.isOk()).toBe(true);
      const { filas, resumen } = result.getValue();
      expect(filas[0].esDuplicado).toBe(true);
      expect(filas[1].esDuplicado).toBe(false);
      expect(resumen.duplicadosDetectados).toBe(1);
      expect(resumen.nuevas).toBe(1);
    });

    it('total overlap: all rows marked esDuplicado: true', async () => {
      const txExistenteReader = new FakeTransaccionExistenteReader();
      txExistenteReader.existentes = TXS.map((tx) => ({
        fecha: tx.fecha,
        descripcion: tx.descripcion,
        cargo: tx.cargo,
        abono: tx.abono,
      }));
      const { useCase } = buildUseCase({ txExistenteReader });

      const result = await useCase.execute({
        fileReader: new FakeFileReader(),
        userId: USER_ID,
      });

      expect(result.isOk()).toBe(true);
      const { filas, resumen } = result.getValue();
      filas.forEach((fila) => expect(fila.esDuplicado).toBe(true));
      expect(resumen.duplicadosDetectados).toBe(TXS.length);
      expect(resumen.nuevas).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Reader failure paths (Fix 7): a reader Result.fail propagates as fail
  // ---------------------------------------------------------------------------
  describe('reader failure propagation', () => {
    it('accountReader.findByBanco fails → execute returns that PersistenciaFallidaError, existenteReader not queried', async () => {
      const accountReader = new FakeAccountReader();
      accountReader.failWith = new PersistenciaFallidaError(
        'fallo leyendo la cuenta',
      );
      const txExistenteReader = new FakeTransaccionExistenteReader();
      const { useCase } = buildUseCase({ accountReader, txExistenteReader });

      const result = await useCase.execute({
        fileReader: new FakeFileReader(),
        userId: USER_ID,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBe(accountReader.failWith);
      // Short-circuits before querying existing transactions.
      expect(txExistenteReader.called).toBe(false);
    });

    it('txExistenteReader.buscarPorCuentaYRango fails → execute returns that PersistenciaFallidaError', async () => {
      const txExistenteReader = new FakeTransaccionExistenteReader();
      txExistenteReader.failWith = new PersistenciaFallidaError(
        'fallo consultando transacciones existentes',
      );
      const { useCase } = buildUseCase({ txExistenteReader });

      const result = await useCase.execute({
        fileReader: new FakeFileReader(),
        userId: USER_ID,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBe(txExistenteReader.failWith);
    });
  });

  // ---------------------------------------------------------------------------
  // D-09: sugerido from catalog
  // ---------------------------------------------------------------------------
  describe('D-09: sugerido from catalog', () => {
    it('matching pattern → sugerido: { bucket, categoriaId }', async () => {
      const catalogo = new FakeCatalogo();
      const catId = 'cat-supermercado';
      catalogo.patrones = [
        new PatronClasificacion({
          id: 'p-1',
          patron: 'movimiento',
          matchType: 'CONTAINS',
          categoria: {
            id: catId,
            nombre: 'Supermercado',
            bucket: Bucket.Necesidades,
          },
          prioridad: 10,
        }),
      ];
      const { useCase } = buildUseCase({ catalogo });

      const result = await useCase.execute({
        fileReader: new FakeFileReader(),
        userId: USER_ID,
      });

      expect(result.isOk()).toBe(true);
      // TXS are 'Movimiento 0' / 'Movimiento 1' — both CONTAIN 'movimiento' (case-insensitive)
      const { filas } = result.getValue();
      filas.forEach((fila) => {
        expect(fila.sugerido).toEqual({
          bucket: Bucket.Necesidades,
          categoriaId: catId,
        });
      });
    });

    it('no match (SinCategoria) → sugerido: null (D-09)', async () => {
      const { useCase } = buildUseCase(); // empty catalog

      const result = await useCase.execute({
        fileReader: new FakeFileReader(),
        userId: USER_ID,
      });

      expect(result.isOk()).toBe(true);
      result.getValue().filas.forEach((fila) => {
        expect(fila.sugerido).toBeNull();
      });
    });

    it('Ingreso rule (abono>0, cargo=0) → sugerido: { bucket: Ingreso, categoriaId: null }', async () => {
      const normalizer = new FakeTransactionNormalizer();
      normalizer.transacciones = [
        Transaccion.crear({
          fecha: new Date('2026-05-14T00:00:00.000Z'),
          descripcion: 'Sueldo',
          cargo: 0n,
          abono: 1500000n,
        }).getValue(),
      ];
      const { useCase } = buildUseCase({ normalizer });

      const result = await useCase.execute({
        fileReader: new FakeFileReader(),
        userId: USER_ID,
      });

      expect(result.isOk()).toBe(true);
      const { filas } = result.getValue();
      expect(filas[0].sugerido).toEqual({
        bucket: Bucket.Ingreso,
        categoriaId: null,
      });
    });

    it('catalog-down (findAll fails): Ingreso still classified, rest sugerido: null — no 500 (D-09 degradation)', async () => {
      const normalizer = new FakeTransactionNormalizer();
      normalizer.transacciones = [
        Transaccion.crear({
          fecha: new Date('2026-05-14T00:00:00.000Z'),
          descripcion: 'Sueldo',
          cargo: 0n,
          abono: 1500000n,
        }).getValue(),
        Transaccion.crear({
          fecha: new Date('2026-05-15T00:00:00.000Z'),
          descripcion: 'Compra',
          cargo: 5000n,
          abono: 0n,
        }).getValue(),
      ];
      const catalogo = new FakeCatalogo();
      catalogo.failWith = new CategorizacionFallidaError('db error');
      const { useCase } = buildUseCase({ normalizer, catalogo });

      const result = await useCase.execute({
        fileReader: new FakeFileReader(),
        userId: USER_ID,
      });

      // Must succeed (no 500) — catalog failure degrades gracefully
      expect(result.isOk()).toBe(true);
      const { filas } = result.getValue();
      // Ingreso rule still fires even when catalog is down
      expect(filas[0].sugerido).toEqual({
        bucket: Bucket.Ingreso,
        categoriaId: null,
      });
      // Non-Ingreso rows → sugerido: null (cannot match without catalog)
      expect(filas[1].sugerido).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Error propagation
  // ---------------------------------------------------------------------------
  it('extensión inválida: retorna fail sin ejecutar ningún paso posterior', async () => {
    const { useCase, bankDetector, structureValidator, normalizer } =
      buildUseCase();

    const result = await useCase.execute({
      fileReader: new FakeFileReader(Buffer.from('x'), 'cartola.csv'),
      userId: USER_ID,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ExtensionNoPermitidaError);
    expect(bankDetector.called).toBe(false);
    expect(structureValidator.called).toBe(false);
    expect(normalizer.called).toBe(false);
  });

  it('banco no reconocido: retorna fail sin validar ni normalizar', async () => {
    const bankDetector = new FakeBankDetector();
    const error = new BancoNoReconocidoError('movimientos.xlsx');
    bankDetector.failWith = error;
    const structureValidator = new FakeStructureValidator();
    const normalizer = new FakeTransactionNormalizer();
    const ejecutarPipelineUseCase = new EjecutarPipelineIngestaUseCase(
      new IngestFileUseCase(new NoOpLogger()),
      new DetectBankUseCase(bankDetector, new NoOpLogger()),
      new DetectPdfBankUseCase(new FakePdfBankDetector(), new NoOpLogger()),
      new ValidateStructureUseCase(structureValidator, new NoOpLogger()),
      new ValidatePdfStructureUseCase(
        new FakePdfStructureValidator(),
        new NoOpLogger(),
      ),
      new NormalizeTransactionsUseCase(normalizer, new NoOpLogger()),
      new NormalizePdfTransactionsUseCase(
        new FakePdfTransactionNormalizer(),
        new NoOpLogger(),
      ),
      new NoOpLogger(),
    );
    const useCase = new PreviewIngestaUseCase(
      ejecutarPipelineUseCase,
      new FakeAccountReader(),
      new FakeTransaccionExistenteReader(),
      new FakeCatalogo(),
      new CategorizarTransaccionUseCase(new NoOpLogger()),
      new NoOpLogger(),
    );

    const result = await useCase.execute({
      fileReader: new FakeFileReader(),
      userId: USER_ID,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error);
    expect(structureValidator.called).toBe(false);
    expect(normalizer.called).toBe(false);
  });

  it('estructura inválida (Excel): retorna fail sin normalizar', async () => {
    const { useCase, structureValidator, normalizer } = buildUseCase();
    const error = new EstructuraInvalidaError('BancoEstado', [
      { tipo: 'SinEncabezados', fila: 1 },
    ]);
    structureValidator.failWith = error;

    const result = await useCase.execute({
      fileReader: new FakeFileReader(),
      userId: USER_ID,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error);
    expect(normalizer.called).toBe(false);
  });

  it('normalización inválida (Excel): retorna fail', async () => {
    const normalizer = new FakeTransactionNormalizer();
    const error = new NormalizacionInvalidaError('BancoEstado', [
      { tipo: 'FilaSinMontos', fila: 3 },
    ]);
    normalizer.failWith = error;
    const { useCase } = buildUseCase({ normalizer });

    const result = await useCase.execute({
      fileReader: new FakeFileReader(),
      userId: USER_ID,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error);
  });

  it('detección PDF falla (PdfInvalidoError): retorna fail sin validar/normalizar', async () => {
    const pdfBankDetector = new FakePdfBankDetector();
    const error = new PdfInvalidoError('corrupto.pdf');
    pdfBankDetector.failWith = error;
    const { useCase, pdfStructureValidator, pdfNormalizer } = buildUseCase({
      pdfBankDetector,
    });

    const result = await useCase.execute({
      fileReader: new FakeFileReader(Buffer.from('%PDF-1.4'), 'corrupto.pdf'),
      userId: USER_ID,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error);
    expect(pdfStructureValidator.called).toBe(false);
    expect(pdfNormalizer.called).toBe(false);
  });

  it('PDF sin texto (PdfSinTextoError vía detección): retorna fail', async () => {
    const pdfBankDetector = new FakePdfBankDetector();
    const error = new PdfSinTextoError('sin-texto.pdf');
    pdfBankDetector.failWith = error;
    const { useCase } = buildUseCase({ pdfBankDetector });

    const result = await useCase.execute({
      fileReader: new FakeFileReader(Buffer.from('%PDF-1.4'), 'sin-texto.pdf'),
      userId: USER_ID,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error);
  });

  it('estructura PDF inválida: retorna fail sin normalizar', async () => {
    const pdfStructureValidator = new FakePdfStructureValidator();
    const error = new EstructuraPdfInvalidaError('BancoEstado', [
      { tipo: 'PdfIlegible' },
    ]);
    pdfStructureValidator.failWith = error;
    const { useCase, pdfNormalizer } = buildUseCase({ pdfStructureValidator });

    const result = await useCase.execute({
      fileReader: new FakeFileReader(Buffer.from('%PDF-1.4'), 'cartola.pdf'),
      userId: USER_ID,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error);
    expect(pdfNormalizer.called).toBe(false);
  });

  it('rango de fechas inválido (PDF, RangoFechasInvalidoError genuino): retorna fail sin normalizar', async () => {
    const pdfStructureValidator = new FakePdfStructureValidator();
    const error = new RangoFechasInvalidoError('BancoEstado');
    pdfStructureValidator.failWith = error;
    const { useCase, pdfNormalizer } = buildUseCase({ pdfStructureValidator });

    const result = await useCase.execute({
      fileReader: new FakeFileReader(Buffer.from('%PDF-1.4'), 'cartola.pdf'),
      userId: USER_ID,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error);
    expect(result.getError()).toBeInstanceOf(RangoFechasInvalidoError);
    expect(pdfNormalizer.called).toBe(false);
  });

  it('normalización PDF falla (EstructuraPdfInvalidaError): retorna fail', async () => {
    const pdfNormalizer = new FakePdfTransactionNormalizer();
    const error = new EstructuraPdfInvalidaError('BancoEstado', [
      { tipo: 'PdfIlegible' },
    ]);
    pdfNormalizer.failWith = error;
    const { useCase } = buildUseCase({ pdfNormalizer });

    const result = await useCase.execute({
      fileReader: new FakeFileReader(Buffer.from('%PDF-1.4'), 'cartola.pdf'),
      userId: USER_ID,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error);
  });

  it('defensivo: un colaborador lanza en vez de retornar Result → Result.fail(PersistenciaFallidaError) sin interpolar el monto crudo', async () => {
    const bankDetector = new FakeBankDetector();
    bankDetector.throwWith = new Error(
      'conexión perdida leyendo la celda con monto 1500000',
    );
    const ejecutarPipelineUseCase = new EjecutarPipelineIngestaUseCase(
      new IngestFileUseCase(new NoOpLogger()),
      new DetectBankUseCase(bankDetector, new NoOpLogger()),
      new DetectPdfBankUseCase(new FakePdfBankDetector(), new NoOpLogger()),
      new ValidateStructureUseCase(
        new FakeStructureValidator(),
        new NoOpLogger(),
      ),
      new ValidatePdfStructureUseCase(
        new FakePdfStructureValidator(),
        new NoOpLogger(),
      ),
      new NormalizeTransactionsUseCase(
        new FakeTransactionNormalizer(),
        new NoOpLogger(),
      ),
      new NormalizePdfTransactionsUseCase(
        new FakePdfTransactionNormalizer(),
        new NoOpLogger(),
      ),
      new NoOpLogger(),
    );
    const useCaseConThrow = new PreviewIngestaUseCase(
      ejecutarPipelineUseCase,
      new FakeAccountReader(),
      new FakeTransaccionExistenteReader(),
      new FakeCatalogo(),
      new CategorizarTransaccionUseCase(new NoOpLogger()),
      new NoOpLogger(),
    );

    const result = await useCaseConThrow.execute({
      fileReader: new FakeFileReader(),
      userId: USER_ID,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PersistenciaFallidaError);
    expect(result.getError().message).not.toContain('1500000');
    expect(
      (result.getError() as PersistenciaFallidaError).causa,
    ).toBeInstanceOf(Error);
  });

  it('D-05: totalFilas is PRE-dedupe count (preview shows all rows including duplicates)', async () => {
    const normalizer = new FakeTransactionNormalizer();
    normalizer.transacciones = TXS;
    const txExistenteReader = new FakeTransaccionExistenteReader();
    // One row is a duplicate — but totalFilas still counts all
    txExistenteReader.existentes = [
      {
        fecha: TXS[0].fecha,
        descripcion: TXS[0].descripcion,
        cargo: TXS[0].cargo,
        abono: TXS[0].abono,
      },
    ];
    const { useCase } = buildUseCase({ normalizer, txExistenteReader });

    const result = await useCase.execute({
      fileReader: new FakeFileReader(),
      userId: USER_ID,
    });

    expect(result.isOk()).toBe(true);
    const value = result.getValue();
    // totalFilas = all rows (PRE-dedupe); filas.length = same (D-08: no cap)
    expect(value.resumen.totalFilas).toBe(TXS.length);
    expect(value.filas.length).toBe(TXS.length);
  });

  describe('debug logging (ADR-033 slice B — redaction contract, ADR-013)', () => {
    it('loguea banco/totalFilas, nunca transacciones ni userId', async () => {
      const normalizer = new FakeTransactionNormalizer();
      // Seed a distinctive, collision-free sensitive payload so the redaction
      // assertion is meaningful (the seeded amount 987654321 and descripcion
      // 'PagoSecreto' cannot collide with aggregate counts like totalFilas).
      normalizer.transacciones = [
        Transaccion.crear({
          fecha: new Date('2026-05-14T00:00:00.000Z'),
          descripcion: 'PagoSecreto',
          cargo: 987654321n,
          abono: 0n,
        }).getValue(),
      ];
      const logger = new FakeLogger();
      const ejecutarPipelineUseCase = new EjecutarPipelineIngestaUseCase(
        new IngestFileUseCase(new NoOpLogger()),
        new DetectBankUseCase(new FakeBankDetector(), new NoOpLogger()),
        new DetectPdfBankUseCase(new FakePdfBankDetector(), new NoOpLogger()),
        new ValidateStructureUseCase(
          new FakeStructureValidator(),
          new NoOpLogger(),
        ),
        new ValidatePdfStructureUseCase(
          new FakePdfStructureValidator(),
          new NoOpLogger(),
        ),
        new NormalizeTransactionsUseCase(normalizer, new NoOpLogger()),
        new NormalizePdfTransactionsUseCase(
          new FakePdfTransactionNormalizer(),
          new NoOpLogger(),
        ),
        new NoOpLogger(),
      );
      const useCase = new PreviewIngestaUseCase(
        ejecutarPipelineUseCase,
        new FakeAccountReader(),
        new FakeTransaccionExistenteReader(),
        new FakeCatalogo(),
        new CategorizarTransaccionUseCase(new NoOpLogger()),
        logger,
      );

      const result = await useCase.execute({
        fileReader: new FakeFileReader(),
        userId: USER_ID,
      });

      expect(result.isOk()).toBe(true);
      const debugCalls = logger.calls.filter((c) => c.level === 'debug');
      expect(debugCalls.length).toBeGreaterThan(0);
      // Fix 5: assert over EVERY debug call — neither the message nor the
      // serialized context may leak the seeded descripcion, the amount, or the
      // userId (ADR-013). Robust to the pipeline UC's extra debug line: iterate
      // all calls instead of collapsing them into one blob (which could mask a
      // leak in a single call behind clean text in another).
      for (const call of debugCalls) {
        const haystack = `${call.message} ${JSON.stringify(call.context ?? {})}`;
        expect(haystack).not.toContain('PagoSecreto');
        expect(haystack).not.toContain('987654321');
        expect(haystack).not.toContain(USER_ID);
      }
    });
  });
});
