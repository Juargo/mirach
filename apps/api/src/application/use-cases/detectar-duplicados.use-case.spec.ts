import { DetectarDuplicadosUseCase } from './detectar-duplicados.use-case';
import { Result } from '../../shared/result';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';
import { Transaccion } from '../../domain/value-objects/transaccion';
import {
  ITransaccionExistenteReader,
  TransaccionExistente,
} from '../ports/transaccion-existente-reader.port';

/** Fake reader — devuelve filas fijas y registra los argumentos de la llamada. */
class FakeTransaccionExistenteReader implements ITransaccionExistenteReader {
  llamadas: Array<{ accountId: string; fechaDesde: Date; fechaHasta: Date }> = [];

  constructor(
    private readonly respuesta: Result<ReadonlyArray<TransaccionExistente>, PersistenciaFallidaError>,
  ) {}

  async buscarPorCuentaYRango(
    accountId: string,
    fechaDesde: Date,
    fechaHasta: Date,
  ): Promise<Result<ReadonlyArray<TransaccionExistente>, PersistenciaFallidaError>> {
    this.llamadas.push({ accountId, fechaDesde, fechaHasta });
    return this.respuesta;
  }
}

function makeTx(overrides: Partial<Transaccion> = {}): Transaccion {
  return Transaccion.crear({
    fecha: new Date('2026-07-01T00:00:00.000Z'),
    descripcion: 'COMPRA LIDER',
    cargo: 5000,
    abono: 0,
    ...overrides,
  }).getValue();
}

function makeExistente(overrides: Partial<TransaccionExistente> = {}): TransaccionExistente {
  return {
    fecha: new Date('2026-07-01T00:00:00.000Z'),
    descripcion: 'COMPRA LIDER',
    cargo: 5000n,
    abono: 0n,
    ...overrides,
  };
}

describe('DetectarDuplicadosUseCase — batch vacío', () => {
  it('batch vacío → ok sin consultar el reader, duplicadas: 0', async () => {
    const reader = new FakeTransaccionExistenteReader(Result.ok([]));
    const useCase = new DetectarDuplicadosUseCase(reader);

    const result = await useCase.execute({ accountId: 'A1', transacciones: [] });

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual({ nuevas: [], duplicadas: 0 });
    expect(reader.llamadas.length).toBe(0);
  });
});

describe('DetectarDuplicadosUseCase — sin existentes', () => {
  it('reader retorna [] → todas nuevas, duplicadas: 0 (CA-04)', async () => {
    const reader = new FakeTransaccionExistenteReader(Result.ok([]));
    const useCase = new DetectarDuplicadosUseCase(reader);
    const transacciones = [makeTx(), makeTx({ descripcion: 'COMPRA JUMBO', cargo: 3000 })];

    const result = await useCase.execute({ accountId: 'A1', transacciones });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().nuevas).toEqual(transacciones);
    expect(result.getValue().duplicadas).toBe(0);
  });
});

describe('DetectarDuplicadosUseCase — solapamiento parcial (N de M)', () => {
  it('N de M ya existen → particiona correctamente, nuevas preserva el orden de entrada', async () => {
    const existente = makeExistente(); // igual a la primera tx
    const reader = new FakeTransaccionExistenteReader(Result.ok([existente]));
    const useCase = new DetectarDuplicadosUseCase(reader);

    const duplicada = makeTx(); // matchea `existente`
    const nueva1 = makeTx({ descripcion: 'COMPRA JUMBO', cargo: 3000 });
    const nueva2 = makeTx({ descripcion: 'COMPRA UNIMARC', cargo: 7000 });
    const transacciones = [duplicada, nueva1, nueva2];

    const result = await useCase.execute({ accountId: 'A1', transacciones });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().nuevas).toEqual([nueva1, nueva2]);
    expect(result.getValue().duplicadas).toBe(1);
  });
});

describe('DetectarDuplicadosUseCase — solapamiento total', () => {
  it('todas las M ya existen → nuevas: [], duplicadas: M', async () => {
    const tx1 = makeTx();
    const tx2 = makeTx({ descripcion: 'COMPRA JUMBO', cargo: 3000 });
    const reader = new FakeTransaccionExistenteReader(
      Result.ok([makeExistente(), makeExistente({ descripcion: 'COMPRA JUMBO', cargo: 3000n })]),
    );
    const useCase = new DetectarDuplicadosUseCase(reader);

    const result = await useCase.execute({ accountId: 'A1', transacciones: [tx1, tx2] });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().nuevas).toEqual([]);
    expect(result.getValue().duplicadas).toBe(2);
  });
});

describe('DetectarDuplicadosUseCase — fallo conservador', () => {
  it('reader Result.fail → use case retorna fail (nada se persiste después)', async () => {
    const error = new PersistenciaFallidaError('no se pudo consultar transacciones existentes');
    const reader = new FakeTransaccionExistenteReader(Result.fail(error));
    const useCase = new DetectarDuplicadosUseCase(reader);

    const result = await useCase.execute({ accountId: 'A1', transacciones: [makeTx()] });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error);
  });
});

describe('DetectarDuplicadosUseCase — rango fecha del batch', () => {
  it('el reader es consultado con el min/max real de fecha del batch y el accountId dado', async () => {
    const reader = new FakeTransaccionExistenteReader(Result.ok([]));
    const useCase = new DetectarDuplicadosUseCase(reader);

    const temprana = makeTx({ fecha: new Date('2026-07-01T00:00:00.000Z') });
    const tardia = makeTx({ fecha: new Date('2026-07-15T00:00:00.000Z'), descripcion: 'OTRA' });
    const media = makeTx({ fecha: new Date('2026-07-10T00:00:00.000Z'), descripcion: 'MEDIA' });

    await useCase.execute({ accountId: 'A1', transacciones: [media, temprana, tardia] });

    expect(reader.llamadas.length).toBe(1);
    expect(reader.llamadas[0].accountId).toBe('A1');
    expect(reader.llamadas[0].fechaDesde.getTime()).toBe(temprana.fecha.getTime());
    expect(reader.llamadas[0].fechaHasta.getTime()).toBe(tardia.fecha.getTime());
  });
});

describe('DetectarDuplicadosUseCase — exactitud BigInt del dinero', () => {
  it('dos transacciones que difieren en 1 unidad de dinero NO son duplicadas (ambas nuevas)', async () => {
    const reader = new FakeTransaccionExistenteReader(Result.ok([makeExistente({ cargo: 5000n })]));
    const useCase = new DetectarDuplicadosUseCase(reader);

    const casiIgual = makeTx({ cargo: 5001 });

    const result = await useCase.execute({ accountId: 'A1', transacciones: [casiIgual] });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().nuevas).toEqual([casiIgual]);
    expect(result.getValue().duplicadas).toBe(0);
  });
});
