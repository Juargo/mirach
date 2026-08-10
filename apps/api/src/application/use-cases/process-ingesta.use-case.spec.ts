import { ProcessIngestaUseCase } from './process-ingesta.use-case';
import { IngestFileUseCase } from './ingest-file.use-case';
import { DetectBankUseCase } from './detect-bank.use-case';
import { DetectPdfBankUseCase } from './detect-pdf-bank.use-case';
import { ValidateStructureUseCase } from './validate-structure.use-case';
import { ValidatePdfStructureUseCase } from './validate-pdf-structure.use-case';
import { NormalizeTransactionsUseCase } from './normalize-transactions.use-case';
import { NormalizePdfTransactionsUseCase } from './normalize-pdf-transactions.use-case';
import { PersistTransactionsUseCase } from './persist-transactions.use-case';
import { CategorizarTransaccionUseCase } from './categorizar-transaccion.use-case';
import { Result } from '../../shared/result';
import { Transaccion } from '../../domain/value-objects/transaccion';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';
import { CategorizacionFallidaError } from '../../domain/errors/categorizacion-fallida.error';
import { ExtensionNoPermitidaError } from '../../domain/errors/extension-no-permitida.error';
import { BancoNoReconocidoError } from '../../domain/errors/banco-no-reconocido.error';
import { EstructuraInvalidaError } from '../../domain/errors/estructura-invalida.error';
import { NormalizacionInvalidaError } from '../../domain/errors/normalizacion-invalida.error';
import { PdfInvalidoError } from '../../domain/errors/pdf-invalido.error';
import { EstructuraPdfInvalidaError } from '../../domain/errors/estructura-pdf-invalida.error';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../domain/value-objects/tipo-cuenta';
import { Bucket } from '../../domain/value-objects/bucket';
import { Categoria } from '../../domain/value-objects/categoria';
import { PatronClasificacion } from '../../domain/value-objects/patron-clasificacion';
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
import { IAccountRepository } from '../ports/account-repository.port';
import {
  CrearIngestaProcesadaInput,
  IIngestaRepository,
} from '../ports/ingesta-repository.port';
import {
  IRegistrarIngestaFallidaWriter,
  RegistrarIngestaFallidaInput,
} from '../ports/registrar-ingesta-fallida.port';
import { ITransaccionRepository } from '../ports/transaccion-repository.port';
import { ICatalogoClasificacion } from '../ports/catalogo-clasificacion.port';
import { ITransaccionBucketWriter } from '../ports/transaccion-bucket-writer.port';
import {
  ITransaccionParaClasificarReader,
  TransaccionParaClasificar,
} from '../ports/transaccion-para-clasificar.port';
import { DetectarDuplicadosUseCase } from './detectar-duplicados.use-case';
import { ITransaccionExistenteReader } from '../ports/transaccion-existente-reader.port';
import { FakeLogger } from '../../../test/support/logger.double';

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
  async validate(): Promise<
    Result<ValidatedStructure, EstructuraInvalidaError>
  > {
    this.called = true;
    if (this.failWith) return Result.fail(this.failWith);
    return Result.ok(ESTRUCTURA);
  }
}

const TXS: Transaccion[] = [
  Transaccion.crear({
    fecha: new Date('2026-05-14T00:00:00.000Z'),
    descripcion: 'Compra',
    cargo: 8103n,
    abono: 0n,
  }).getValue(),
  Transaccion.crear({
    fecha: new Date('2026-05-15T00:00:00.000Z'),
    descripcion: 'Sueldo',
    cargo: 0n,
    abono: 1500000n,
  }).getValue(),
];

class FakeTransactionNormalizer implements ITransactionNormalizer {
  called = false;
  failWith?: NormalizacionInvalidaError;
  returnEmpty = false;
  async normalize(): Promise<
    Result<ReadonlyArray<Transaccion>, NormalizacionInvalidaError>
  > {
    this.called = true;
    if (this.failWith) return Result.fail(this.failWith);
    return Result.ok(this.returnEmpty ? [] : TXS);
  }
}

/** PDF trio fakes (Phase 6/PR5 — routing). Distinct TX fixture so a test can
 * prove the PDF path was actually exercised (not a false-positive from
 * reusing the Excel fixture by accident). */
class FakePdfBankDetector implements IPdfBankDetector {
  called = false;
  failWith?: PdfInvalidoError | BancoNoReconocidoError;
  async detect(): Promise<
    Result<DetectedBank, PdfInvalidoError | BancoNoReconocidoError>
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
  failWith?: EstructuraPdfInvalidaError;
  async validate(): Promise<
    Result<EstructuraPdfValidada, EstructuraPdfInvalidaError>
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
  async normalize(): Promise<
    Result<ReadonlyArray<Transaccion>, EstructuraPdfInvalidaError>
  > {
    this.called = true;
    if (this.failWith) return Result.fail(this.failWith);
    return Result.ok(TXS_PDF);
  }
}

class FakeAccountRepository implements IAccountRepository {
  called = false;
  failWith?: PersistenciaFallidaError;
  async ensure(): Promise<
    Result<{ accountId: string }, PersistenciaFallidaError>
  > {
    this.called = true;
    if (this.failWith) return Result.fail(this.failWith);
    return Result.ok({ accountId: 'acc-1' });
  }
}

interface IngestaRecord {
  id: string;
  estado: 'PROCESADA';
  duplicadosOmitidos: number;
}

/**
 * Fake mínimo del port COLAPSADO (US-004, design.md §6.3/§7.1): una única
 * `persistirProcesada` reemplaza createPending/commit/markFailed. Bajo el
 * nuevo diseño, un `persistirProcesada` fallido NO deja fila alguna en este
 * store (mismo comportamiento atómico que Prisma) — la FALLIDA la escribe el
 * boundary vía `FakeRegistrarIngestaFallidaWriter`, no este store.
 */
class FakeIngestaStore implements IIngestaRepository, ITransaccionRepository {
  private seq = 0;
  readonly ingestas = new Map<string, IngestaRecord>();
  failWith?: PersistenciaFallidaError;
  /** Transacciones REALMENTE recibidas por persistirProcesada() (para probar que solo `nuevas` llegan). */
  readonly commitTransacciones: Array<ReadonlyArray<Transaccion>> = [];
  readonly persistCalls: CrearIngestaProcesadaInput[] = [];

  async persistirProcesada(
    input: CrearIngestaProcesadaInput,
  ): Promise<
    Result<{ ingestaId: string; total: number }, PersistenciaFallidaError>
  > {
    this.persistCalls.push(input);
    this.commitTransacciones.push(input.transacciones);
    if (this.failWith) {
      return Result.fail(this.failWith);
    }
    const id = `ingesta-${++this.seq}`;
    this.ingestas.set(id, {
      id,
      estado: 'PROCESADA',
      duplicadosOmitidos: input.duplicadosOmitidos,
    });
    return Result.ok({ ingestaId: id, total: input.transacciones.length });
  }

  async findByIngesta(): Promise<ReadonlyArray<Transaccion>> {
    return TXS;
  }
}

/**
 * Fake del boundary de registro de fallos (US-004, design.md §3.2). El
 * boundary lo invoca en `ProcessIngestaUseCase.execute()` — nunca en
 * `runPipeline` — así que estos fakes solo se ejercitan a través de
 * `execute()`.
 */
class FakeRegistrarIngestaFallidaWriter implements IRegistrarIngestaFallidaWriter {
  readonly calls: RegistrarIngestaFallidaInput[] = [];
  failWith?: PersistenciaFallidaError;
  throwWith?: Error;

  async registrar(
    input: RegistrarIngestaFallidaInput,
  ): Promise<Result<void, PersistenciaFallidaError>> {
    this.calls.push(input);
    if (this.throwWith) throw this.throwWith;
    if (this.failWith) return Result.fail(this.failWith);
    return Result.ok(undefined);
  }
}

/** Filas persistidas que el lector de clasificación devuelve (con ids). */
const TX_PARA_CLASIFICAR: TransaccionParaClasificar[] = [
  { id: 'tx-persisted-1', descripcion: 'Compra', cargo: 8103n, abono: 0n },
  { id: 'tx-persisted-2', descripcion: 'Sueldo', cargo: 0n, abono: 1500000n },
];

class FakeCatalogo implements ICatalogoClasificacion {
  failWith?: CategorizacionFallidaError;
  patrones: ReadonlyArray<PatronClasificacion> = [];

  async findAll(): Promise<
    Result<ReadonlyArray<PatronClasificacion>, CategorizacionFallidaError>
  > {
    if (this.failWith) return Result.fail(this.failWith);
    return Result.ok(this.patrones);
  }
}

class FakeBucketWriter implements ITransaccionBucketWriter {
  calls: Array<
    ReadonlyArray<{
      transaccionId: string;
      categoria: Categoria | null;
      bucket: Bucket;
    }>
  > = [];
  receivedIngestaIds: string[] = [];
  failWith?: CategorizacionFallidaError;

  async asignarCategorizacion(
    ingestaId: string,
    asignaciones: ReadonlyArray<{
      transaccionId: string;
      categoria: Categoria | null;
      bucket: Bucket;
    }>,
  ): Promise<Result<{ actualizadas: number }, CategorizacionFallidaError>> {
    this.receivedIngestaIds.push(ingestaId);
    this.calls.push(asignaciones);
    if (this.failWith) return Result.fail(this.failWith);
    return Result.ok({ actualizadas: asignaciones.length });
  }
}

class FakeTxParaClasificarReader implements ITransaccionParaClasificarReader {
  rows: TransaccionParaClasificar[] = TX_PARA_CLASIFICAR;
  receivedIngestaId: string | undefined;

  async findParaClasificar(
    ingestaId: string,
  ): Promise<ReadonlyArray<TransaccionParaClasificar>> {
    this.receivedIngestaId = ingestaId;
    return this.rows;
  }
}

/** Fake del reader de US-005 — controla qué "existentes" ve DetectarDuplicadosUseCase. */
class FakeTransaccionExistenteReader implements ITransaccionExistenteReader {
  existentes: Array<{
    fecha: Date;
    descripcion: string;
    cargo: bigint;
    abono: bigint;
  }> = [];
  failWith?: PersistenciaFallidaError;
  called = false;

  async buscarPorCuentaYRango() {
    this.called = true;
    if (this.failWith) return Result.fail(this.failWith);
    return Result.ok(this.existentes);
  }
}

interface BuildOptions {
  catalogo?: FakeCatalogo;
  bucketWriter?: FakeBucketWriter;
  txReader?: FakeTxParaClasificarReader;
  pdfBankDetector?: FakePdfBankDetector;
  pdfStructureValidator?: FakePdfStructureValidator;
  pdfNormalizer?: FakePdfTransactionNormalizer;
  txExistenteReader?: FakeTransaccionExistenteReader;
  ingestaFallidaWriter?: FakeRegistrarIngestaFallidaWriter;
  logger?: FakeLogger;
}

function buildUseCase(opts?: BuildOptions) {
  const bankDetector = new FakeBankDetector();
  const structureValidator = new FakeStructureValidator();
  const normalizer = new FakeTransactionNormalizer();
  const pdfBankDetector = opts?.pdfBankDetector ?? new FakePdfBankDetector();
  const pdfStructureValidator =
    opts?.pdfStructureValidator ?? new FakePdfStructureValidator();
  const pdfNormalizer =
    opts?.pdfNormalizer ?? new FakePdfTransactionNormalizer();
  const accountRepository = new FakeAccountRepository();
  const ingestaStore = new FakeIngestaStore();
  const catalogo = opts?.catalogo ?? new FakeCatalogo();
  const bucketWriter = opts?.bucketWriter ?? new FakeBucketWriter();
  const txReader = opts?.txReader ?? new FakeTxParaClasificarReader();
  const txExistenteReader =
    opts?.txExistenteReader ?? new FakeTransaccionExistenteReader();
  const detectarDuplicadosUseCase = new DetectarDuplicadosUseCase(
    txExistenteReader,
  );
  const ingestaFallidaWriter =
    opts?.ingestaFallidaWriter ?? new FakeRegistrarIngestaFallidaWriter();
  const logger = opts?.logger ?? new FakeLogger();

  const useCase = new ProcessIngestaUseCase(
    new IngestFileUseCase(),
    new DetectBankUseCase(bankDetector),
    new DetectPdfBankUseCase(pdfBankDetector),
    accountRepository,
    new ValidateStructureUseCase(structureValidator),
    new ValidatePdfStructureUseCase(pdfStructureValidator),
    new NormalizeTransactionsUseCase(normalizer),
    new NormalizePdfTransactionsUseCase(pdfNormalizer),
    new PersistTransactionsUseCase(ingestaStore),
    catalogo,
    bucketWriter,
    new CategorizarTransaccionUseCase(),
    txReader,
    detectarDuplicadosUseCase,
    ingestaFallidaWriter,
    logger,
  );

  return {
    useCase,
    bankDetector,
    structureValidator,
    normalizer,
    pdfBankDetector,
    pdfStructureValidator,
    pdfNormalizer,
    accountRepository,
    ingestaStore,
    catalogo,
    bucketWriter,
    txReader,
    txExistenteReader,
    ingestaFallidaWriter,
    logger,
  };
}

const USER_ID = 'usuario-fijo-moneydiary';

describe('ProcessIngestaUseCase', () => {
  it('happy path: encadena detectar → asegurar cuenta → validar → normalizar → persistir', async () => {
    const {
      useCase,
      bankDetector,
      structureValidator,
      normalizer,
      accountRepository,
      ingestaStore,
      ingestaFallidaWriter,
    } = buildUseCase();

    const result = await useCase.execute({
      fileReader: new FakeFileReader(),
      userId: USER_ID,
    });

    expect(result.isOk()).toBe(true);
    const value = result.getValue();
    expect(value.banco).toEqual(BANCO);
    expect(value.estructura).toEqual({
      filaEncabezados: 1,
      totalFilasDatos: 2,
    });
    expect(value.total).toBe(2);
    expect(value.transacciones).toEqual(TXS);
    expect(value.ingestaId).toBeDefined();
    expect(value.duplicadosOmitidos).toBe(0);

    expect(bankDetector.called).toBe(true);
    expect(accountRepository.called).toBe(true);
    expect(structureValidator.called).toBe(true);
    expect(normalizer.called).toBe(true);
    expect(ingestaStore.ingestas.get(value.ingestaId)?.estado).toBe(
      'PROCESADA',
    );
    // ING-07/D1: el éxito NUNCA registra una fila FALLIDA.
    expect(ingestaFallidaWriter.calls).toHaveLength(0);
  });

  it('extensión inválida: retorna fail sin ejecutar ningún paso posterior, Y registra una fila FALLIDA (boundary)', async () => {
    const {
      useCase,
      bankDetector,
      structureValidator,
      normalizer,
      accountRepository,
      ingestaFallidaWriter,
    } = buildUseCase();

    // .csv (no .pdf): Sprint 4 (sprint4-pdf-ingesta, PDF-00) hizo que .pdf
    // pase el gate de extensión — el routing PDF real dentro de este
    // orquestador llega recién en una slice posterior (Phase 6/PR5). Una
    // extensión genuinamente no soportada sigue probando el mismo camino
    // (el pipeline se detiene ANTES de tocar bankDetector/accountRepository/
    // structureValidator/normalizer).
    const result = await useCase.execute({
      fileReader: new FakeFileReader(Buffer.from('x'), 'cartola.csv'),
      userId: USER_ID,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ExtensionNoPermitidaError);
    expect(bankDetector.called).toBe(false);
    expect(accountRepository.called).toBe(false);
    expect(structureValidator.called).toBe(false);
    expect(normalizer.called).toBe(false);

    // ING-07: incluso esta falla PRE-CUENTA registra una fila FALLIDA — el
    // boundary observa el Result.fail de runPipeline en execute(), no
    // adentro del pipeline.
    expect(ingestaFallidaWriter.calls).toHaveLength(1);
    expect(ingestaFallidaWriter.calls[0]).toEqual({
      userId: USER_ID,
      nombreArchivo: 'cartola.csv',
      motivo: result.getError().message,
    });
  });

  it('banco no reconocido: retorna fail sin asegurar cuenta ni validar/normalizar/persistir, Y registra FALLIDA', async () => {
    const {
      useCase,
      bankDetector,
      structureValidator,
      normalizer,
      accountRepository,
      ingestaFallidaWriter,
    } = buildUseCase();
    const error = new BancoNoReconocidoError('movimientos.xlsx');
    bankDetector.failWith = error;

    const result = await useCase.execute({
      fileReader: new FakeFileReader(),
      userId: USER_ID,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error);
    expect(accountRepository.called).toBe(false);
    expect(structureValidator.called).toBe(false);
    expect(normalizer.called).toBe(false);

    expect(ingestaFallidaWriter.calls).toHaveLength(1);
    expect(ingestaFallidaWriter.calls[0]).toEqual({
      userId: USER_ID,
      nombreArchivo: 'movimientos.xlsx',
      motivo: error.message,
    });
  });

  it('falla el aseguramiento de cuenta: retorna fail sin validar/normalizar/persistir, Y registra FALLIDA', async () => {
    const {
      useCase,
      structureValidator,
      normalizer,
      accountRepository,
      ingestaFallidaWriter,
    } = buildUseCase();
    const error = new PersistenciaFallidaError('no se pudo asegurar la cuenta');
    accountRepository.failWith = error;

    const result = await useCase.execute({
      fileReader: new FakeFileReader(),
      userId: USER_ID,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error);
    expect(structureValidator.called).toBe(false);
    expect(normalizer.called).toBe(false);

    expect(ingestaFallidaWriter.calls).toHaveLength(1);
    expect(ingestaFallidaWriter.calls[0].motivo).toBe(error.message);
  });

  it('estructura inválida: retorna fail sin normalizar ni persistir, Y registra FALLIDA', async () => {
    const { useCase, structureValidator, normalizer, ingestaFallidaWriter } =
      buildUseCase();
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

    expect(ingestaFallidaWriter.calls).toHaveLength(1);
    expect(ingestaFallidaWriter.calls[0].motivo).toBe(error.message);
  });

  it('normalización inválida: retorna fail sin persistir, Y registra FALLIDA', async () => {
    const { useCase, normalizer, ingestaStore, ingestaFallidaWriter } =
      buildUseCase();
    const error = new NormalizacionInvalidaError('BancoEstado', [
      { tipo: 'FilaSinMontos', fila: 3 },
    ]);
    normalizer.failWith = error;

    const result = await useCase.execute({
      fileReader: new FakeFileReader(),
      userId: USER_ID,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error);
    expect(ingestaStore.ingestas.size).toBe(0);

    expect(ingestaFallidaWriter.calls).toHaveLength(1);
    expect(ingestaFallidaWriter.calls[0].motivo).toBe(error.message);
  });

  it('falla la persistencia: retorna fail y registra una fila FALLIDA (single-writer boundary, no ingestaStore FALLIDA)', async () => {
    const { useCase, ingestaStore, ingestaFallidaWriter } = buildUseCase();
    const error = new PersistenciaFallidaError('base de datos no disponible');
    ingestaStore.failWith = error;

    const result = await useCase.execute({
      fileReader: new FakeFileReader(),
      userId: USER_ID,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error);
    // US-004/D1: un persistirProcesada fallido no deja NINGUNA fila en el
    // repositorio de éxito (atómico) — la única fila que queda es la FALLIDA
    // que escribe el boundary, no algo dentro de ingestaStore.
    expect(ingestaStore.ingestas.size).toBe(0);

    expect(ingestaFallidaWriter.calls).toHaveLength(1);
    expect(ingestaFallidaWriter.calls[0]).toEqual({
      userId: USER_ID,
      nombreArchivo: 'movimientos.xlsx',
      motivo: error.message,
    });
  });

  it('lista de transacciones vacía: persiste con total 0 y retorna ok, sin registrar FALLIDA', async () => {
    const { useCase, normalizer, ingestaStore, ingestaFallidaWriter } =
      buildUseCase();
    normalizer.returnEmpty = true;

    const result = await useCase.execute({
      fileReader: new FakeFileReader(),
      userId: USER_ID,
    });

    expect(result.isOk()).toBe(true);
    const value = result.getValue();
    expect(value.total).toBe(0);
    expect(value.transacciones).toEqual([]);
    expect(ingestaStore.ingestas.get(value.ingestaId)?.estado).toBe(
      'PROCESADA',
    );
    expect(ingestaFallidaWriter.calls).toHaveLength(0);
  });

  it('un colaborador lanza en vez de retornar Result: NO propaga, retorna fail descriptivo sin filtrar montos, Y registra FALLIDA con el motivo FIJO genérico (no el mensaje crudo)', async () => {
    const { useCase, bankDetector, ingestaFallidaWriter } = buildUseCase();
    // Simula una excepción inesperada de infraestructura (ExcelJS/Prisma) cuyo
    // mensaje podría contener datos sensibles si se propagara tal cual.
    bankDetector.throwWith = new Error(
      'conexión perdida leyendo la celda con monto 1500000',
    );

    const result = await useCase.execute({
      fileReader: new FakeFileReader(),
      userId: USER_ID,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PersistenciaFallidaError);
    // El mensaje descriptivo NO debe interpolar el mensaje crudo del error
    // (podría filtrar montos u otros datos sensibles).
    expect(result.getError().message).not.toContain('1500000');

    // El motivo registrado es el mismo mensaje FIJO/genérico devuelto — nunca
    // el error crudo lanzado por el colaborador (ING-09, no-leak).
    expect(ingestaFallidaWriter.calls).toHaveLength(1);
    const { motivo } = ingestaFallidaWriter.calls[0];
    expect(motivo).toBe(result.getError().message);
    expect(motivo).not.toContain('1500000');
  });

  describe('registro de fallos: island estructuralmente never-throw (US-004, design §3.2)', () => {
    it('registrar() devuelve Result.fail: execute() NO lanza y preserva el Result ORIGINAL de runPipeline', async () => {
      const ingestaFallidaWriter = new FakeRegistrarIngestaFallidaWriter();
      ingestaFallidaWriter.failWith = new PersistenciaFallidaError(
        'no se pudo registrar el intento fallido',
      );
      const { useCase, bankDetector } = buildUseCase({ ingestaFallidaWriter });
      const originalError = new BancoNoReconocidoError('movimientos.xlsx');
      bankDetector.failWith = originalError;

      const result = await useCase.execute({
        fileReader: new FakeFileReader(),
        userId: USER_ID,
      });

      // El fallo de registrar() NUNCA cambia el error que ve el caller.
      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBe(originalError);
      expect(ingestaFallidaWriter.calls).toHaveLength(1);
    });

    it('registrar() LANZA inesperadamente: execute() NO lanza y preserva el Result ORIGINAL de runPipeline', async () => {
      const ingestaFallidaWriter = new FakeRegistrarIngestaFallidaWriter();
      ingestaFallidaWriter.throwWith = new Error('conexión perdida');
      const { useCase, bankDetector } = buildUseCase({ ingestaFallidaWriter });
      const originalError = new BancoNoReconocidoError('movimientos.xlsx');
      bankDetector.failWith = originalError;

      // No debe rechazar aunque registrar() lance.
      const result = await useCase.execute({
        fileReader: new FakeFileReader(),
        userId: USER_ID,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBe(originalError);
    });
  });

  // T16 — Categorization orchestration tests (US-012, SC-13, SC-14, SC-15)
  describe('categorización post-persistencia', () => {
    it('SC-13: falla el catálogo → ingesta PROCESADA; filas no-Ingreso quedan null (no se escriben)', async () => {
      const catalogo = new FakeCatalogo();
      catalogo.failWith = new CategorizacionFallidaError(
        'db error al cargar catálogo',
      );
      const bucketWriter = new FakeBucketWriter();
      const { useCase, ingestaStore } = buildUseCase({
        catalogo,
        bucketWriter,
      });

      const result = await useCase.execute({
        fileReader: new FakeFileReader(),
        userId: USER_ID,
      });

      // Ingesta SIEMPRE PROCESADA
      expect(result.isOk()).toBe(true);
      const [record] = Array.from(ingestaStore.ingestas.values());
      expect(record.estado).toBe('PROCESADA');

      // Bajo fallo de catálogo, una tx de gasto (cargo>0, abono=0) NO se escribe:
      // queda bucketId null (pendiente/reintentable), nunca SinCategoria.
      // TX_PARA_CLASIFICAR[0] = { cargo: 8103n, abono: 0n }.
      const allAsignaciones = bucketWriter.calls.flat();
      const expenseAsig = allAsignaciones.find(
        (a) => a.transaccionId === 'tx-persisted-1',
      );
      expect(expenseAsig).toBeUndefined();
      // Ninguna asignación SinCategoria se escribe durante la degradación.
      expect(
        allAsignaciones.some((a) => a.bucket === Bucket.SinCategoria),
      ).toBe(false);
    });

    it('SC-14: falla el catálogo pero una tx tiene abono>0, cargo=0 → esa tx recibe Ingreso, ingesta PROCESADA', async () => {
      const catalogo = new FakeCatalogo();
      catalogo.failWith = new CategorizacionFallidaError(
        'db error al cargar catálogo',
      );
      const bucketWriter = new FakeBucketWriter();
      // TX_PARA_CLASIFICAR[1] = { cargo: 0, abono: 1500000 } → debe ser Ingreso
      const { useCase } = buildUseCase({ catalogo, bucketWriter });

      const result = await useCase.execute({
        fileReader: new FakeFileReader(),
        userId: USER_ID,
      });

      expect(result.isOk()).toBe(true);
      // bucketWriter debe haber sido llamado con la tx de Ingreso
      expect(bucketWriter.calls.length).toBeGreaterThan(0);
      const todasLasAsignaciones = bucketWriter.calls.flat();
      const ingresoAsignacion = todasLasAsignaciones.find(
        (a) => a.transaccionId === 'tx-persisted-2',
      );
      expect(ingresoAsignacion).toBeDefined();
      expect(ingresoAsignacion!.bucket).toBe(Bucket.Ingreso);
    });

    it('SC-15 (scope isolation): asignarCategorizacion solo se llama con ids de la ingesta actual', async () => {
      const bucketWriter = new FakeBucketWriter();
      const txReader = new FakeTxParaClasificarReader();
      // Solo 2 ids de la ingesta actual
      txReader.rows = [
        { id: 'tx-current-1', descripcion: 'Compra', cargo: 5000n, abono: 0n },
        {
          id: 'tx-current-2',
          descripcion: 'Sueldo',
          cargo: 0n,
          abono: 800000n,
        },
      ];
      const { useCase } = buildUseCase({ bucketWriter, txReader });

      await useCase.execute({
        fileReader: new FakeFileReader(),
        userId: USER_ID,
      });

      expect(bucketWriter.calls.length).toBeGreaterThan(0);
      const allIds = bucketWriter.calls.flat().map((a) => a.transaccionId);
      // Solo ids de la ingesta actual (no ids externos)
      expect(allIds).toContain('tx-current-1');
      expect(allIds).toContain('tx-current-2');
      expect(allIds).not.toContain('tx-persisted-1');
      expect(allIds).not.toContain('tx-persisted-2');
    });

    it('falla el writer → ingesta PROCESADA, no propaga el error al caller', async () => {
      const bucketWriter = new FakeBucketWriter();
      bucketWriter.failWith = new CategorizacionFallidaError(
        'error al escribir buckets',
      );
      const { useCase, ingestaStore } = buildUseCase({ bucketWriter });

      const result = await useCase.execute({
        fileReader: new FakeFileReader(),
        userId: USER_ID,
      });

      // Ingesta sigue PROCESADA aunque el writer falle
      expect(result.isOk()).toBe(true);
      const [record] = Array.from(ingestaStore.ingestas.values());
      expect(record.estado).toBe('PROCESADA');
    });

    it('happy path con catálogo: asignarCategorizacion llamado con el mapeo {categoria,bucket} correcto por tx', async () => {
      const catalogo = new FakeCatalogo();
      catalogo.patrones = [
        new PatronClasificacion({
          id: 'p-1',
          patron: 'compra',
          matchType: 'CONTAINS',
          categoria: Categoria.Supermercado,
          prioridad: 10,
        }),
      ];
      const bucketWriter = new FakeBucketWriter();
      const { useCase } = buildUseCase({ catalogo, bucketWriter });

      const result = await useCase.execute({
        fileReader: new FakeFileReader(),
        userId: USER_ID,
      });

      expect(result.isOk()).toBe(true);
      expect(bucketWriter.calls.length).toBeGreaterThan(0);
      const allAsignaciones = bucketWriter.calls.flat();
      // tx-persisted-1 (Compra, cargo>0) → Supermercado/Necesidades via patron CONTAINS 'compra'
      const compraAsig = allAsignaciones.find(
        (a) => a.transaccionId === 'tx-persisted-1',
      );
      expect(compraAsig?.categoria).toBe(Categoria.Supermercado);
      expect(compraAsig?.bucket).toBe(Bucket.Necesidades);
      // tx-persisted-2 (Sueldo, abono>0 cargo=0) → Ingreso rule, sin categoría
      const sueldoAsig = allAsignaciones.find(
        (a) => a.transaccionId === 'tx-persisted-2',
      );
      expect(sueldoAsig?.categoria).toBeNull();
      expect(sueldoAsig?.bucket).toBe(Bucket.Ingreso);
    });

    it('ingestaId thread-through: findParaClasificar and asignarCategorizacion receive the SAME ingestaId from persist', async () => {
      // Verifies that the ingestaId produced by PersistTransactions is correctly
      // threaded all the way through the categorization step to both the reader
      // and the writer (proves end-to-end scope correctness, not just local wiring).
      const bucketWriter = new FakeBucketWriter();
      const txReader = new FakeTxParaClasificarReader();
      const { useCase, ingestaStore } = buildUseCase({
        bucketWriter,
        txReader,
      });

      const result = await useCase.execute({
        fileReader: new FakeFileReader(),
        userId: USER_ID,
      });

      expect(result.isOk()).toBe(true);
      const [record] = Array.from(ingestaStore.ingestas.values());
      const ingestaId = record.id;

      // Reader received the same ingestaId that PersistTransactions produced
      expect(txReader.receivedIngestaId).toBe(ingestaId);
      // Writer also received that same ingestaId (structural scope lock)
      expect(bucketWriter.receivedIngestaIds[0]).toBe(ingestaId);
    });

    it('ingesta vacía (reader devuelve []): resultado { asignadas: 0, sinCategoria: 0 }, writer NO invocado', async () => {
      const bucketWriter = new FakeBucketWriter();
      const txReader = new FakeTxParaClasificarReader();
      txReader.rows = [];
      const { useCase } = buildUseCase({ bucketWriter, txReader });

      const result = await useCase.execute({
        fileReader: new FakeFileReader(),
        userId: USER_ID,
      });

      expect(result.isOk()).toBe(true);
      const { categorizacion } = result.getValue();
      expect(categorizacion).toEqual({ asignadas: 0, sinCategoria: 0 });
      // Writer must NOT be called when there are no transactions to classify
      expect(bucketWriter.calls.length).toBe(0);
    });
  });

  // US-005 (Slice 2) — dedupe detection wired before persist.
  describe('detección de duplicados (US-005)', () => {
    it('overlap parcial: solo las nuevas llegan a persistirProcesada(); duplicadosOmitidos threaded al resultado', async () => {
      // TXS[0] = Compra (cargo 8103), TXS[1] = Sueldo (abono 1500000).
      const txExistenteReader = new FakeTransaccionExistenteReader();
      txExistenteReader.existentes = [
        {
          fecha: TXS[0].fecha,
          descripcion: TXS[0].descripcion,
          cargo: 8103n,
          abono: 0n,
        },
      ];
      const { useCase, ingestaStore } = buildUseCase({ txExistenteReader });

      const result = await useCase.execute({
        fileReader: new FakeFileReader(),
        userId: USER_ID,
      });

      expect(result.isOk()).toBe(true);
      const value = result.getValue();
      expect(value.duplicadosOmitidos).toBe(1);
      expect(value.total).toBe(1);
      expect(value.transacciones).toEqual([TXS[1]]);
      // persistirProcesada() solo recibe la transacción NUEVA (Sueldo), no la duplicada (Compra).
      expect(ingestaStore.commitTransacciones[0]).toEqual([TXS[1]]);
      const [record] = Array.from(ingestaStore.ingestas.values());
      expect(record.duplicadosOmitidos).toBe(1);
    });

    it('overlap total: nuevas=[] llega a persistirProcesada(), duplicadosOmitidos = N, Ingesta igual queda PROCESADA', async () => {
      const txExistenteReader = new FakeTransaccionExistenteReader();
      txExistenteReader.existentes = TXS.map((tx) => ({
        fecha: tx.fecha,
        descripcion: tx.descripcion,
        cargo: BigInt(tx.cargo),
        abono: BigInt(tx.abono),
      }));
      const { useCase, ingestaStore } = buildUseCase({ txExistenteReader });

      const result = await useCase.execute({
        fileReader: new FakeFileReader(),
        userId: USER_ID,
      });

      expect(result.isOk()).toBe(true);
      const value = result.getValue();
      expect(value.duplicadosOmitidos).toBe(2);
      expect(value.total).toBe(0);
      expect(value.transacciones).toEqual([]);
      expect(ingestaStore.commitTransacciones[0]).toEqual([]);
      const [record] = Array.from(ingestaStore.ingestas.values());
      expect(record.estado).toBe('PROCESADA');
    });

    it('el reader de duplicados falla: la ingesta NUNCA se crea (persist jamás se llama), retorna fail Y registra FALLIDA', async () => {
      const txExistenteReader = new FakeTransaccionExistenteReader();
      const error = new PersistenciaFallidaError(
        'no se pudo consultar transacciones existentes para deduplicación',
      );
      txExistenteReader.failWith = error;
      const { useCase, ingestaStore, ingestaFallidaWriter } = buildUseCase({
        txExistenteReader,
      });

      const result = await useCase.execute({
        fileReader: new FakeFileReader(),
        userId: USER_ID,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBe(error);
      // Nada se persiste: ni siquiera se creó una Ingesta PROCESADA.
      expect(ingestaStore.ingestas.size).toBe(0);
      expect(ingestaFallidaWriter.calls).toHaveLength(1);
      expect(ingestaFallidaWriter.calls[0].motivo).toBe(error.message);
    });
  });

  // Phase 6/Track D (PR5) — extension routing: .pdf → PDF trio, .xlsx → Excel trio.
  // Downstream (account ensure → persist → categorize) is IDENTICAL either way.
  describe('routing .pdf vs .xlsx (Phase 6/PR5)', () => {
    it('.pdf invoca el trio PDF (detect/validate/normalize) y NO el trio Excel', async () => {
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
      expect(value.transacciones).toEqual(TXS_PDF);
      expect(value.estructura).toEqual({
        filaEncabezados: ESTRUCTURA_PDF.paginaInicioTabla,
        totalFilasDatos: TXS_PDF.length,
      });

      expect(pdfBankDetector.called).toBe(true);
      expect(pdfStructureValidator.called).toBe(true);
      expect(pdfNormalizer.called).toBe(true);
      expect(bankDetector.called).toBe(false);
      expect(structureValidator.called).toBe(false);
      expect(normalizer.called).toBe(false);
    });

    it('.xlsx invoca el trio Excel y NO el trio PDF', async () => {
      const { useCase, pdfBankDetector, pdfStructureValidator, pdfNormalizer } =
        buildUseCase();

      const result = await useCase.execute({
        fileReader: new FakeFileReader(),
        userId: USER_ID,
      });

      expect(result.isOk()).toBe(true);
      expect(pdfBankDetector.called).toBe(false);
      expect(pdfStructureValidator.called).toBe(false);
      expect(pdfNormalizer.called).toBe(false);
    });

    it('detección PDF falla (PdfInvalidoError): retorna fail sin asegurar cuenta ni validar/normalizar/persistir, Y registra FALLIDA', async () => {
      const pdfBankDetector = new FakePdfBankDetector();
      const error = new PdfInvalidoError('corrupto.pdf');
      pdfBankDetector.failWith = error;
      const {
        useCase,
        pdfStructureValidator,
        pdfNormalizer,
        accountRepository,
        ingestaStore,
        ingestaFallidaWriter,
      } = buildUseCase({ pdfBankDetector });

      const result = await useCase.execute({
        fileReader: new FakeFileReader(Buffer.from('%PDF-1.4'), 'corrupto.pdf'),
        userId: USER_ID,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBe(error);
      expect(accountRepository.called).toBe(false);
      expect(pdfStructureValidator.called).toBe(false);
      expect(pdfNormalizer.called).toBe(false);
      expect(ingestaStore.ingestas.size).toBe(0);

      expect(ingestaFallidaWriter.calls).toHaveLength(1);
      expect(ingestaFallidaWriter.calls[0]).toEqual({
        userId: USER_ID,
        nombreArchivo: 'corrupto.pdf',
        motivo: error.message,
      });
    });

    it('normalización PDF falla (EstructuraPdfInvalidaError): retorna fail sin persistir, Y registra FALLIDA', async () => {
      const { useCase, pdfNormalizer, ingestaStore, ingestaFallidaWriter } =
        buildUseCase();
      const error = new EstructuraPdfInvalidaError('BancoEstado', [
        { tipo: 'PdfIlegible' },
      ]);
      pdfNormalizer.failWith = error;

      const result = await useCase.execute({
        fileReader: new FakeFileReader(Buffer.from('%PDF-1.4'), 'cartola.pdf'),
        userId: USER_ID,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBe(error);
      expect(ingestaStore.ingestas.size).toBe(0);

      expect(ingestaFallidaWriter.calls).toHaveLength(1);
      expect(ingestaFallidaWriter.calls[0].motivo).toBe(error.message);
    });
  });
});
