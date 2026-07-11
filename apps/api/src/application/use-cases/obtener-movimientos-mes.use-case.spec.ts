import { ObtenerMovimientosMesUseCase } from './obtener-movimientos-mes.use-case';
import { IMovimientosMesReader, MovimientoMesRow } from '../ports/movimientos-mes.port';
import { PeriodoInvalidoError } from '../../domain/errors/periodo-invalido.error';

const makeRow = (overrides: Partial<MovimientoMesRow> = {}): MovimientoMesRow => ({
  id: 'tx-001',
  fecha: new Date('2026-07-10T00:00:00.000Z'),
  descripcion: 'Compra supermercado',
  cargo: 50000n,
  abono: 0n,
  banco: 'BCI',
  tipoCuenta: 'Cuenta Corriente',
  numeroCuenta: '12345678',
  bucketId: null,
  ...overrides,
});

describe('ObtenerMovimientosMesUseCase', () => {
  let readerMock: jest.Mocked<IMovimientosMesReader>;
  let useCase: ObtenerMovimientosMesUseCase;

  beforeEach(() => {
    readerMock = {
      findByPeriodo: jest.fn(),
    };
    useCase = new ObtenerMovimientosMesUseCase(readerMock);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('invalid periodo string', () => {
    it('returns Result.fail(PeriodoInvalidoError) and never calls reader', async () => {
      const result = await useCase.execute({ userId: 'user-1', periodo: '2026-13' });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PeriodoInvalidoError);
      expect(readerMock.findByPeriodo).not.toHaveBeenCalled();
    });

    it('empty string periodo → Result.fail, reader NOT called', async () => {
      const result = await useCase.execute({ userId: 'user-1', periodo: '' });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PeriodoInvalidoError);
      expect(readerMock.findByPeriodo).not.toHaveBeenCalled();
    });

    it('abc → Result.fail, reader NOT called', async () => {
      const result = await useCase.execute({ userId: 'user-1', periodo: 'abc' });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PeriodoInvalidoError);
      expect(readerMock.findByPeriodo).not.toHaveBeenCalled();
    });
  });

  describe('valid periodo string', () => {
    it('returns Result.ok with periodo echoed and rows passed through', async () => {
      const rows = [makeRow(), makeRow({ id: 'tx-002', cargo: 0n, abono: 100000n })];
      readerMock.findByPeriodo.mockResolvedValue(rows);

      const result = await useCase.execute({ userId: 'user-1', periodo: '2026-07' });

      expect(result.isOk()).toBe(true);
      const data = result.getValue();
      expect(data.periodo).toBe('2026-07');
      expect(data.transacciones).toEqual(rows);
      expect(data.transacciones.length).toBe(2);
    });

    it('reader returns empty array → Result.ok with empty transacciones (not a failure — AC-04)', async () => {
      readerMock.findByPeriodo.mockResolvedValue([]);

      const result = await useCase.execute({ userId: 'user-1', periodo: '2026-05' });

      expect(result.isOk()).toBe(true);
      const data = result.getValue();
      expect(data.transacciones).toEqual([]);
      expect(data.periodo).toBe('2026-05');
    });

    it('rows are passed through in reader order without re-sorting', async () => {
      const rows = [
        makeRow({ id: 'tx-z', fecha: new Date('2026-07-20T00:00:00.000Z') }),
        makeRow({ id: 'tx-a', fecha: new Date('2026-07-01T00:00:00.000Z') }),
      ];
      readerMock.findByPeriodo.mockResolvedValue(rows);

      const result = await useCase.execute({ userId: 'user-1', periodo: '2026-07' });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().transacciones[0].id).toBe('tx-z');
      expect(result.getValue().transacciones[1].id).toBe('tx-a');
    });

    it('calls reader with the correct userId and the resolved PeriodoMes', async () => {
      readerMock.findByPeriodo.mockResolvedValue([makeRow()]);

      await useCase.execute({ userId: 'user-42', periodo: '2026-07' });

      expect(readerMock.findByPeriodo).toHaveBeenCalledTimes(1);
      const [calledUserId, calledPeriodo] = readerMock.findByPeriodo.mock.calls[0];
      expect(calledUserId).toBe('user-42');
      expect(calledPeriodo.valor).toBe('2026-07');
    });
  });

  describe('absent periodo (undefined)', () => {
    it('uses PeriodoMes.actual() and calls reader with current month', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-07-15T12:00:00.000Z'));

      readerMock.findByPeriodo.mockResolvedValue([makeRow()]);

      const result = await useCase.execute({ userId: 'user-1', periodo: undefined });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().periodo).toBe('2026-07');
      expect(readerMock.findByPeriodo).toHaveBeenCalledTimes(1);
      const [, calledPeriodo] = readerMock.findByPeriodo.mock.calls[0];
      expect(calledPeriodo.valor).toBe('2026-07');
    });
  });
});
