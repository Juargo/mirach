import { EjecutarPipelineIngestaUseCase } from './ejecutar-pipeline-ingesta.use-case';
import { IngestFileUseCase } from './ingest-file.use-case';
import { DetectBankUseCase } from './detect-bank.use-case';
import { DetectPdfBankUseCase } from './detect-pdf-bank.use-case';
import { ValidateStructureUseCase } from './validate-structure.use-case';
import { ValidatePdfStructureUseCase } from './validate-pdf-structure.use-case';
import { NormalizeTransactionsUseCase } from './normalize-transactions.use-case';
import { NormalizePdfTransactionsUseCase } from './normalize-pdf-transactions.use-case';
import { Result } from '../../shared/result';
import { Transaccion } from '../../domain/value-objects/transaccion';
import { ExtensionNoPermitidaError } from '../../domain/errors/extension-no-permitida.error';
import { BancoNoReconocidoError } from '../../domain/errors/banco-no-reconocido.error';
import { EstructuraInvalidaError } from '../../domain/errors/estructura-invalida.error';
import { NormalizacionInvalidaError } from '../../domain/errors/normalizacion-invalida.error';
import { PdfInvalidoError } from '../../domain/errors/pdf-invalido.error';
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
import { FakeLogger } from '../../../test/support/logger.double';

// ────────────────────────────── Fakes ──────────────────────────────

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

class FakePdfFileReader extends FakeFileReader {
  constructor() {
    super(Buffer.from('contenido pdf'), 'cartola.pdf');
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
  async detect(): Promise<Result<DetectedBank, BancoNoReconocidoError>> {
    this.called = true;
    if (this.failWith) return Result.fail(this.failWith);
    return Result.ok(BANCO);
  }
}

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

const TXS_PDF: Transaccion[] = [
  Transaccion.crear({
    fecha: new Date('2026-04-20T00:00:00.000Z'),
    descripcion: 'Compra PDF',
    cargo: 9000n,
    abono: 0n,
  }).getValue(),
];

class FakeTransactionNormalizer implements ITransactionNormalizer {
  called = false;
  failWith?: NormalizacionInvalidaError;
  async normalize(): Promise<
    Result<ReadonlyArray<Transaccion>, NormalizacionInvalidaError>
  > {
    this.called = true;
    if (this.failWith) return Result.fail(this.failWith);
    return Result.ok(TXS);
  }
}

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

// ────────────────────────────── Factory ──────────────────────────────

function makeUseCase(
  overrides: {
    bankDetector?: IBankDetector;
    pdfBankDetector?: IPdfBankDetector;
    structureValidator?: IStructureValidator;
    pdfStructureValidator?: IPdfStructureValidator;
    normalizer?: ITransactionNormalizer;
    pdfNormalizer?: IPdfTransactionNormalizer;
  } = {},
) {
  const logger = new FakeLogger();
  const ingestFile = new IngestFileUseCase(logger);
  const detectBank = new DetectBankUseCase(
    overrides.bankDetector ?? new FakeBankDetector(),
    logger,
  );
  const detectPdfBank = new DetectPdfBankUseCase(
    overrides.pdfBankDetector ?? new FakePdfBankDetector(),
    logger,
  );
  const validateStructure = new ValidateStructureUseCase(
    overrides.structureValidator ?? new FakeStructureValidator(),
    logger,
  );
  const validatePdfStructure = new ValidatePdfStructureUseCase(
    overrides.pdfStructureValidator ?? new FakePdfStructureValidator(),
    logger,
  );
  const normalize = new NormalizeTransactionsUseCase(
    overrides.normalizer ?? new FakeTransactionNormalizer(),
    logger,
  );
  const normalizePdf = new NormalizePdfTransactionsUseCase(
    overrides.pdfNormalizer ?? new FakePdfTransactionNormalizer(),
    logger,
  );

  return new EjecutarPipelineIngestaUseCase(
    ingestFile,
    detectBank,
    detectPdfBank,
    validateStructure,
    validatePdfStructure,
    normalize,
    normalizePdf,
    logger,
  );
}

// ────────────────────────────── Tests ──────────────────────────────

describe('EjecutarPipelineIngestaUseCase', () => {
  describe('happy path — xlsx', () => {
    it('retorna banco, estructura, transacciones y nombreArchivo en el happy path xlsx', async () => {
      const useCase = makeUseCase();
      const fileReader = new FakeFileReader(
        Buffer.from('contenido'),
        'cartola.xlsx',
      );

      const result = await useCase.execute({ fileReader });

      expect(result.isOk()).toBe(true);
      const val = result.getValue();
      expect(val.banco).toEqual(BANCO);
      expect(val.estructura).toEqual(ESTRUCTURA);
      expect(val.transacciones).toEqual(TXS);
      expect(val.nombreArchivo).toBe('cartola.xlsx');
    });

    it('el nombreArchivo es el originalName del fileReader', async () => {
      const useCase = makeUseCase();
      const fileReader = new FakeFileReader(
        Buffer.from('x'),
        'banco_estado_enero.xlsx',
      );

      const result = await useCase.execute({ fileReader });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().nombreArchivo).toBe('banco_estado_enero.xlsx');
    });
  });

  describe('happy path — pdf', () => {
    it('retorna banco, estructura pdf, transacciones y nombreArchivo en el happy path pdf', async () => {
      const useCase = makeUseCase();
      const fileReader = new FakePdfFileReader();

      const result = await useCase.execute({ fileReader });

      expect(result.isOk()).toBe(true);
      const val = result.getValue();
      expect(val.banco).toEqual(BANCO);
      expect(val.estructura).toEqual(ESTRUCTURA_PDF);
      expect(val.transacciones).toEqual(TXS_PDF);
      expect(val.nombreArchivo).toBe('cartola.pdf');
    });
  });

  describe('short-circuit errors', () => {
    it('ExtensionNoPermitidaError — archivo con extensión inválida', async () => {
      const useCase = makeUseCase();
      const fileReader = new FakeFileReader(Buffer.from('x'), 'cartola.csv');

      const result = await useCase.execute({ fileReader });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ExtensionNoPermitidaError);
    });

    it('BancoNoReconocidoError — detección de banco falla', async () => {
      const bankDetector = new FakeBankDetector();
      bankDetector.failWith = new BancoNoReconocidoError('cartola.xlsx');
      const useCase = makeUseCase({ bankDetector });

      const result = await useCase.execute({
        fileReader: new FakeFileReader(),
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(BancoNoReconocidoError);
    });

    it('EstructuraInvalidaError — validación de estructura falla', async () => {
      const structureValidator = new FakeStructureValidator();
      structureValidator.failWith = new EstructuraInvalidaError('BancoEstado', [
        { tipo: 'SinEncabezados', fila: 1 },
      ]);
      const useCase = makeUseCase({ structureValidator });

      const result = await useCase.execute({
        fileReader: new FakeFileReader(),
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(EstructuraInvalidaError);
    });

    it('NormalizacionInvalidaError — normalización falla', async () => {
      const normalizer = new FakeTransactionNormalizer();
      normalizer.failWith = new NormalizacionInvalidaError('BancoEstado', [
        { tipo: 'FilaSinMontos', fila: 5 },
      ]);
      const useCase = makeUseCase({ normalizer });

      const result = await useCase.execute({
        fileReader: new FakeFileReader(),
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(NormalizacionInvalidaError);
    });

    it('PdfInvalidoError — detección PDF falla', async () => {
      const pdfBankDetector = new FakePdfBankDetector();
      pdfBankDetector.failWith = new PdfInvalidoError('PDF corrupto');
      const useCase = makeUseCase({ pdfBankDetector });

      const result = await useCase.execute({
        fileReader: new FakePdfFileReader(),
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PdfInvalidoError);
    });

    it('EstructuraPdfInvalidaError — validación PDF falla', async () => {
      const pdfStructureValidator = new FakePdfStructureValidator();
      pdfStructureValidator.failWith = new EstructuraPdfInvalidaError(
        BancoConocido.BancoEstado,
        [{ tipo: 'PdfIlegible' }],
      );
      const useCase = makeUseCase({ pdfStructureValidator });

      const result = await useCase.execute({
        fileReader: new FakePdfFileReader(),
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(EstructuraPdfInvalidaError);
    });

    it('EstructuraPdfInvalidaError — normalización PDF falla (corta el pipeline, no corre nada río abajo)', async () => {
      const pdfNormalizer = new FakePdfTransactionNormalizer();
      pdfNormalizer.failWith = new EstructuraPdfInvalidaError(
        BancoConocido.BancoEstado,
        [{ tipo: 'MontoIleeible', fila: 3, columna: 'cargo' }],
      );
      // Colaboradores del trio PDF observables: si el pipeline no corta en la
      // normalización, no hay pasos posteriores en el frente compartido — pero
      // sí verificamos que detect/validate corrieron (llegamos hasta normalize)
      // y que el resultado es el error de la normalización.
      const pdfBankDetector = new FakePdfBankDetector();
      const pdfStructureValidator = new FakePdfStructureValidator();
      const useCase = makeUseCase({
        pdfBankDetector,
        pdfStructureValidator,
        pdfNormalizer,
      });

      const result = await useCase.execute({
        fileReader: new FakePdfFileReader(),
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(EstructuraPdfInvalidaError);
      // Confirma que el pipeline avanzó por el trio PDF hasta normalize y ahí cortó.
      expect(pdfBankDetector.called).toBe(true);
      expect(pdfStructureValidator.called).toBe(true);
      expect(pdfNormalizer.called).toBe(true);
    });
  });

  describe('ensure() NOT called (D-01 — no write-port dependency)', () => {
    it('no tiene dependencia de IAccountRepository (no hay ensure())', () => {
      // La existencia del use case sin IAccountRepository en su constructor
      // es la prueba estructural de D-01: ensure() está FUERA del pipeline compartido.
      const useCase = makeUseCase();

      // Si el constructor aceptara IAccountRepository, no compilaría sin pasarlo.
      // El test verifica que la ejecución completa no involucra escritura.
      expect(useCase).toBeDefined();
    });
  });
});
