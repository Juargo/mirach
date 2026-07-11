import { ProcessIngestaUseCase } from './process-ingesta.use-case';
import { IngestFileUseCase } from './ingest-file.use-case';
import { DetectBankUseCase } from './detect-bank.use-case';
import { ValidateStructureUseCase } from './validate-structure.use-case';
import { NormalizeTransactionsUseCase } from './normalize-transactions.use-case';
import { PersistTransactionsUseCase } from './persist-transactions.use-case';
import { Result } from '../../shared/result';
import { Transaccion } from '../../domain/value-objects/transaccion';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';
import { ExtensionNoPermitidaError } from '../../domain/errors/extension-no-permitida.error';
import { BancoNoReconocidoError } from '../../domain/errors/banco-no-reconocido.error';
import { EstructuraInvalidaError } from '../../domain/errors/estructura-invalida.error';
import { NormalizacionInvalidaError } from '../../domain/errors/normalizacion-invalida.error';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../domain/value-objects/tipo-cuenta';
import { IFileReader } from '../ports/file-reader.port';
import { IBankDetector, DetectedBank } from '../ports/bank-detector.port';
import { IStructureValidator, ValidatedStructure } from '../ports/structure-validator.port';
import { ITransactionNormalizer } from '../ports/transaction-normalizer.port';
import { IAccountRepository } from '../ports/account-repository.port';
import {
  CrearIngestaInput,
  IIngestaRepository,
} from '../ports/ingesta-repository.port';
import { ITransaccionRepository } from '../ports/transaccion-repository.port';

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
  async validate(): Promise<Result<ValidatedStructure, EstructuraInvalidaError>> {
    this.called = true;
    if (this.failWith) return Result.fail(this.failWith);
    return Result.ok(ESTRUCTURA);
  }
}

const TXS: Transaccion[] = [
  { fecha: new Date('2026-05-14T00:00:00.000Z'), descripcion: 'Compra', cargo: 8103, abono: 0 },
  { fecha: new Date('2026-05-15T00:00:00.000Z'), descripcion: 'Sueldo', cargo: 0, abono: 1500000 },
];

class FakeTransactionNormalizer implements ITransactionNormalizer {
  called = false;
  failWith?: NormalizacionInvalidaError;
  returnEmpty = false;
  async normalize(): Promise<Result<ReadonlyArray<Transaccion>, NormalizacionInvalidaError>> {
    this.called = true;
    if (this.failWith) return Result.fail(this.failWith);
    return Result.ok(this.returnEmpty ? [] : TXS);
  }
}

class FakeAccountRepository implements IAccountRepository {
  called = false;
  failWith?: PersistenciaFallidaError;
  async ensure(): Promise<Result<{ accountId: string }, PersistenciaFallidaError>> {
    this.called = true;
    if (this.failWith) return Result.fail(this.failWith);
    return Result.ok({ accountId: 'acc-1' });
  }
}

interface IngestaRecord {
  id: string;
  estado: 'PENDIENTE' | 'PROCESADA' | 'FALLIDA';
  motivoFallo: string | null;
}

/** Fake mínimo: implementa ambos ports que consume PersistTransactionsUseCase. */
class FakeIngestaStore implements IIngestaRepository, ITransaccionRepository {
  private seq = 0;
  readonly ingestas = new Map<string, IngestaRecord>();
  failCommitWith?: PersistenciaFallidaError;

  async createPending(
    input: CrearIngestaInput,
  ): Promise<Result<{ ingestaId: string }, PersistenciaFallidaError>> {
    void input;
    const id = `ingesta-${++this.seq}`;
    this.ingestas.set(id, { id, estado: 'PENDIENTE', motivoFallo: null });
    return Result.ok({ ingestaId: id });
  }

  async commit(
    ingestaId: string,
    accountId: string,
    transacciones: ReadonlyArray<Transaccion>,
  ): Promise<Result<{ total: number }, PersistenciaFallidaError>> {
    void accountId;
    if (this.failCommitWith) {
      return Result.fail(this.failCommitWith);
    }
    const rec = this.ingestas.get(ingestaId);
    if (rec) rec.estado = 'PROCESADA';
    return Result.ok({ total: transacciones.length });
  }

  async markFailed(
    ingestaId: string,
    motivo: string,
  ): Promise<Result<void, PersistenciaFallidaError>> {
    const rec = this.ingestas.get(ingestaId);
    if (rec) {
      rec.estado = 'FALLIDA';
      rec.motivoFallo = motivo;
    }
    return Result.ok(undefined);
  }

  async findByIngesta(): Promise<ReadonlyArray<Transaccion>> {
    return TXS;
  }
}

function buildUseCase() {
  const bankDetector = new FakeBankDetector();
  const structureValidator = new FakeStructureValidator();
  const normalizer = new FakeTransactionNormalizer();
  const accountRepository = new FakeAccountRepository();
  const ingestaStore = new FakeIngestaStore();

  const useCase = new ProcessIngestaUseCase(
    new IngestFileUseCase(),
    new DetectBankUseCase(bankDetector),
    accountRepository,
    new ValidateStructureUseCase(structureValidator),
    new NormalizeTransactionsUseCase(normalizer),
    new PersistTransactionsUseCase(ingestaStore),
  );

  return { useCase, bankDetector, structureValidator, normalizer, accountRepository, ingestaStore };
}

const USER_ID = 'usuario-fijo-moneydiary';

describe('ProcessIngestaUseCase', () => {
  it('happy path: encadena detectar → asegurar cuenta → validar → normalizar → persistir', async () => {
    const { useCase, bankDetector, structureValidator, normalizer, accountRepository, ingestaStore } =
      buildUseCase();

    const result = await useCase.execute({ fileReader: new FakeFileReader(), userId: USER_ID });

    expect(result.isOk()).toBe(true);
    const value = result.getValue();
    expect(value.banco).toEqual(BANCO);
    expect(value.estructura).toEqual({ filaEncabezados: 1, totalFilasDatos: 2 });
    expect(value.total).toBe(2);
    expect(value.transacciones).toEqual(TXS);
    expect(value.ingestaId).toBeDefined();

    expect(bankDetector.called).toBe(true);
    expect(accountRepository.called).toBe(true);
    expect(structureValidator.called).toBe(true);
    expect(normalizer.called).toBe(true);
    expect(ingestaStore.ingestas.get(value.ingestaId)?.estado).toBe('PROCESADA');
  });

  it('extensión inválida: retorna fail sin ejecutar ningún paso posterior', async () => {
    const { useCase, bankDetector, structureValidator, normalizer, accountRepository } = buildUseCase();

    const result = await useCase.execute({
      fileReader: new FakeFileReader(Buffer.from('x'), 'cartola.pdf'),
      userId: USER_ID,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ExtensionNoPermitidaError);
    expect(bankDetector.called).toBe(false);
    expect(accountRepository.called).toBe(false);
    expect(structureValidator.called).toBe(false);
    expect(normalizer.called).toBe(false);
  });

  it('banco no reconocido: retorna fail sin asegurar cuenta ni validar/normalizar/persistir', async () => {
    const { useCase, bankDetector, structureValidator, normalizer, accountRepository } = buildUseCase();
    const error = new BancoNoReconocidoError('movimientos.xlsx');
    bankDetector.failWith = error;

    const result = await useCase.execute({ fileReader: new FakeFileReader(), userId: USER_ID });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error);
    expect(accountRepository.called).toBe(false);
    expect(structureValidator.called).toBe(false);
    expect(normalizer.called).toBe(false);
  });

  it('falla el aseguramiento de cuenta: retorna fail sin validar/normalizar/persistir', async () => {
    const { useCase, structureValidator, normalizer, accountRepository } = buildUseCase();
    const error = new PersistenciaFallidaError('no se pudo asegurar la cuenta');
    accountRepository.failWith = error;

    const result = await useCase.execute({ fileReader: new FakeFileReader(), userId: USER_ID });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error);
    expect(structureValidator.called).toBe(false);
    expect(normalizer.called).toBe(false);
  });

  it('estructura inválida: retorna fail sin normalizar ni persistir', async () => {
    const { useCase, structureValidator, normalizer } = buildUseCase();
    const error = new EstructuraInvalidaError('BancoEstado', [{ tipo: 'SinEncabezados', fila: 1 }]);
    structureValidator.failWith = error;

    const result = await useCase.execute({ fileReader: new FakeFileReader(), userId: USER_ID });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error);
    expect(normalizer.called).toBe(false);
  });

  it('normalización inválida: retorna fail sin persistir', async () => {
    const { useCase, normalizer, ingestaStore } = buildUseCase();
    const error = new NormalizacionInvalidaError('BancoEstado', [{ tipo: 'FilaSinMontos', fila: 3 }]);
    normalizer.failWith = error;

    const result = await useCase.execute({ fileReader: new FakeFileReader(), userId: USER_ID });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error);
    expect(ingestaStore.ingestas.size).toBe(0);
  });

  it('falla la persistencia: retorna fail y la Ingesta queda FALLIDA', async () => {
    const { useCase, ingestaStore } = buildUseCase();
    const error = new PersistenciaFallidaError('base de datos no disponible');
    ingestaStore.failCommitWith = error;

    const result = await useCase.execute({ fileReader: new FakeFileReader(), userId: USER_ID });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error);
    const [record] = Array.from(ingestaStore.ingestas.values());
    expect(record.estado).toBe('FALLIDA');
    expect(record.motivoFallo).toBe('base de datos no disponible');
  });

  it('lista de transacciones vacía: persiste con total 0 y retorna ok', async () => {
    const { useCase, normalizer, ingestaStore } = buildUseCase();
    normalizer.returnEmpty = true;

    const result = await useCase.execute({ fileReader: new FakeFileReader(), userId: USER_ID });

    expect(result.isOk()).toBe(true);
    const value = result.getValue();
    expect(value.total).toBe(0);
    expect(value.transacciones).toEqual([]);
    expect(ingestaStore.ingestas.get(value.ingestaId)?.estado).toBe('PROCESADA');
  });

  it('un colaborador lanza en vez de retornar Result: NO propaga, retorna fail descriptivo sin filtrar montos', async () => {
    const { useCase, bankDetector } = buildUseCase();
    // Simula una excepción inesperada de infraestructura (ExcelJS/Prisma) cuyo
    // mensaje podría contener datos sensibles si se propagara tal cual.
    bankDetector.throwWith = new Error('conexión perdida leyendo la celda con monto 1500000');

    const result = await useCase.execute({ fileReader: new FakeFileReader(), userId: USER_ID });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PersistenciaFallidaError);
    // El mensaje descriptivo NO debe interpolar el mensaje crudo del error
    // (podría filtrar montos u otros datos sensibles).
    expect(result.getError().message).not.toContain('1500000');
  });
});
