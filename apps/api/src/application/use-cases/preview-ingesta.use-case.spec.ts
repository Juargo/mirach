import {
  PreviewIngestaUseCase,
  PREVIEW_SAMPLE_MAX,
} from './preview-ingesta.use-case';
import { IngestFileUseCase } from './ingest-file.use-case';
import { DetectBankUseCase } from './detect-bank.use-case';
import { DetectPdfBankUseCase } from './detect-pdf-bank.use-case';
import { ValidateStructureUseCase } from './validate-structure.use-case';
import { ValidatePdfStructureUseCase } from './validate-pdf-structure.use-case';
import { NormalizeTransactionsUseCase } from './normalize-transactions.use-case';
import { NormalizePdfTransactionsUseCase } from './normalize-pdf-transactions.use-case';
import { Result } from '../../shared/result';
import { Transaccion } from '../../domain/value-objects/transaccion';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';
import { ExtensionNoPermitidaError } from '../../domain/errors/extension-no-permitida.error';
import { BancoNoReconocidoError } from '../../domain/errors/banco-no-reconocido.error';
import { EstructuraInvalidaError } from '../../domain/errors/estructura-invalida.error';
import { NormalizacionInvalidaError } from '../../domain/errors/normalizacion-invalida.error';
import { PdfInvalidoError } from '../../domain/errors/pdf-invalido.error';
import { PdfSinTextoError } from '../../domain/errors/pdf-sin-texto.error';
import { EstructuraPdfInvalidaError } from '../../domain/errors/estructura-pdf-invalida.error';
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
  transacciones: ReadonlyArray<Transaccion> = TXS_PDF;
  async normalize(): Promise<
    Result<ReadonlyArray<Transaccion>, EstructuraPdfInvalidaError>
  > {
    this.called = true;
    if (this.failWith) return Result.fail(this.failWith);
    return Result.ok(this.transacciones);
  }
}

interface BuildOptions {
  pdfBankDetector?: FakePdfBankDetector;
  pdfStructureValidator?: FakePdfStructureValidator;
  pdfNormalizer?: FakePdfTransactionNormalizer;
  normalizer?: FakeTransactionNormalizer;
}

function buildUseCase(opts?: BuildOptions) {
  const bankDetector = new FakeBankDetector();
  const structureValidator = new FakeStructureValidator();
  const normalizer = opts?.normalizer ?? new FakeTransactionNormalizer();
  const pdfBankDetector = opts?.pdfBankDetector ?? new FakePdfBankDetector();
  const pdfStructureValidator =
    opts?.pdfStructureValidator ?? new FakePdfStructureValidator();
  const pdfNormalizer =
    opts?.pdfNormalizer ?? new FakePdfTransactionNormalizer();

  const useCase = new PreviewIngestaUseCase(
    new IngestFileUseCase(),
    new DetectBankUseCase(bankDetector),
    new DetectPdfBankUseCase(pdfBankDetector),
    new ValidateStructureUseCase(structureValidator),
    new ValidatePdfStructureUseCase(pdfStructureValidator),
    new NormalizeTransactionsUseCase(normalizer),
    new NormalizePdfTransactionsUseCase(pdfNormalizer),
  );

  return {
    useCase,
    bankDetector,
    structureValidator,
    normalizer,
    pdfBankDetector,
    pdfStructureValidator,
    pdfNormalizer,
  };
}

describe('PreviewIngestaUseCase', () => {
  it('CA-04 estructural: el constructor solo acepta los 7 colaboradores sin escritura (sin accountRepository/persist/dedupe/categorize)', () => {
    // La garantía es la aridad del constructor en sí misma — no hay ningún
    // colaborador de escritura que stubear ni cuya llamada a `ensure()` espiar.
    expect(PreviewIngestaUseCase.length).toBe(7);
  });

  it('happy Excel: encadena ingest → detect → validate → normalize y retorna banco/estructura/muestra', async () => {
    const {
      useCase,
      bankDetector,
      structureValidator,
      normalizer,
      pdfBankDetector,
      pdfStructureValidator,
      pdfNormalizer,
    } = buildUseCase();

    const result = await useCase.execute({ fileReader: new FakeFileReader() });

    expect(result.isOk()).toBe(true);
    const value = result.getValue();
    expect(value.banco).toEqual(BANCO);
    expect(value.estructura).toEqual({ totalFilasDatos: TXS.length });
    expect(value.muestra).toEqual(TXS);

    expect(bankDetector.called).toBe(true);
    expect(structureValidator.called).toBe(true);
    expect(normalizer.called).toBe(true);
    expect(pdfBankDetector.called).toBe(false);
    expect(pdfStructureValidator.called).toBe(false);
    expect(pdfNormalizer.called).toBe(false);
  });

  it('happy PDF: invoca el trio PDF y NO el trio Excel (guarda del branch esPdf, design §4)', async () => {
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
    });

    expect(result.isOk()).toBe(true);
    const value = result.getValue();
    expect(value.muestra).toEqual(TXS_PDF);
    expect(value.estructura).toEqual({ totalFilasDatos: TXS_PDF.length });

    expect(pdfBankDetector.called).toBe(true);
    expect(pdfStructureValidator.called).toBe(true);
    expect(pdfNormalizer.called).toBe(true);
    expect(bankDetector.called).toBe(false);
    expect(structureValidator.called).toBe(false);
    expect(normalizer.called).toBe(false);
  });

  it('cap: normalize retorna 120 filas → muestra tiene 50, totalFilasDatos es 120', async () => {
    const normalizer = new FakeTransactionNormalizer();
    normalizer.transacciones = crearTxs(120);
    const { useCase } = buildUseCase({ normalizer });

    const result = await useCase.execute({ fileReader: new FakeFileReader() });

    expect(result.isOk()).toBe(true);
    const value = result.getValue();
    expect(value.muestra.length).toBe(PREVIEW_SAMPLE_MAX);
    expect(value.estructura.totalFilasDatos).toBe(120);
  });

  it('archivo con menos de 50 filas: retorna todas sin rellenar (uncapped por debajo del máximo)', async () => {
    const normalizer = new FakeTransactionNormalizer();
    normalizer.transacciones = crearTxs(7);
    const { useCase } = buildUseCase({ normalizer });

    const result = await useCase.execute({ fileReader: new FakeFileReader() });

    expect(result.isOk()).toBe(true);
    const value = result.getValue();
    expect(value.muestra.length).toBe(7);
    expect(value.estructura.totalFilasDatos).toBe(7);
  });

  it('extensión inválida: retorna fail sin ejecutar ningún paso posterior', async () => {
    const { useCase, bankDetector, structureValidator, normalizer } =
      buildUseCase();

    const result = await useCase.execute({
      fileReader: new FakeFileReader(Buffer.from('x'), 'cartola.csv'),
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

    const useCase = new PreviewIngestaUseCase(
      new IngestFileUseCase(),
      new DetectBankUseCase(bankDetector),
      new DetectPdfBankUseCase(new FakePdfBankDetector()),
      new ValidateStructureUseCase(structureValidator),
      new ValidatePdfStructureUseCase(new FakePdfStructureValidator()),
      new NormalizeTransactionsUseCase(normalizer),
      new NormalizePdfTransactionsUseCase(new FakePdfTransactionNormalizer()),
    );

    const result = await useCase.execute({ fileReader: new FakeFileReader() });

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

    const result = await useCase.execute({ fileReader: new FakeFileReader() });

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

    const result = await useCase.execute({ fileReader: new FakeFileReader() });

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
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error);
    expect(pdfNormalizer.called).toBe(false);
  });

  it('rango de fechas inválido (PDF): retorna fail', async () => {
    const pdfStructureValidator = new FakePdfStructureValidator();
    const error = new EstructuraPdfInvalidaError('BancoEstado', [
      { tipo: 'PeriodoFaltante' },
    ]);
    pdfStructureValidator.failWith = error;
    const { useCase } = buildUseCase({ pdfStructureValidator });

    const result = await useCase.execute({
      fileReader: new FakeFileReader(Buffer.from('%PDF-1.4'), 'cartola.pdf'),
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error);
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
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error);
  });

  it('defensivo (D9): un colaborador lanza en vez de retornar Result → Result.fail(PersistenciaFallidaError) sin interpolar el monto crudo', async () => {
    const bankDetector = new FakeBankDetector();
    bankDetector.throwWith = new Error(
      'conexión perdida leyendo la celda con monto 1500000',
    );
    const useCaseConThrow = new PreviewIngestaUseCase(
      new IngestFileUseCase(),
      new DetectBankUseCase(bankDetector),
      new DetectPdfBankUseCase(new FakePdfBankDetector()),
      new ValidateStructureUseCase(new FakeStructureValidator()),
      new ValidatePdfStructureUseCase(new FakePdfStructureValidator()),
      new NormalizeTransactionsUseCase(new FakeTransactionNormalizer()),
      new NormalizePdfTransactionsUseCase(new FakePdfTransactionNormalizer()),
    );

    const result = await useCaseConThrow.execute({
      fileReader: new FakeFileReader(),
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PersistenciaFallidaError);
    expect(result.getError().message).not.toContain('1500000');
    expect(
      (result.getError() as PersistenciaFallidaError).causa,
    ).toBeInstanceOf(Error);
  });
});
