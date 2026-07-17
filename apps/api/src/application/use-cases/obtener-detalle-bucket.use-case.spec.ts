import type { Mocked } from 'vitest';
import { ObtenerDetalleBucketUseCase } from './obtener-detalle-bucket.use-case';
import {
  IDetalleBucketReader,
  DetalleBucketRow,
} from '../ports/detalle-bucket.port';
import { Bucket } from '../../domain/value-objects/bucket';
import { BucketInvalidoError } from '../../domain/errors/bucket-invalido.error';
import { PeriodoInvalidoError } from '../../domain/errors/periodo-invalido.error';

const makeRow = (
  overrides: Partial<DetalleBucketRow> = {},
): DetalleBucketRow => ({
  id: 'tx-001',
  fecha: new Date('2026-07-10T00:00:00.000Z'),
  descripcion: 'Compra supermercado',
  cargo: 50000n,
  abono: 0n,
  banco: 'BCI',
  tipoCuenta: 'Cuenta Corriente',
  numeroCuenta: '12345678',
  ...overrides,
});

describe('ObtenerDetalleBucketUseCase', () => {
  let readerMock: Mocked<IDetalleBucketReader>;
  let useCase: ObtenerDetalleBucketUseCase;

  beforeEach(() => {
    readerMock = {
      findByPeriodoYBucket: vi.fn(),
    };
    useCase = new ObtenerDetalleBucketUseCase(readerMock);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('bucket inválido', () => {
    it('valor fuera del enum Bucket → Result.fail(BucketInvalidoError), reader NUNCA llamado', async () => {
      const result = await useCase.execute({
        userId: 'user-1',
        bucket: 'no-existe',
        periodo: '2026-07',
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(BucketInvalidoError);
      expect(readerMock.findByPeriodoYBucket).not.toHaveBeenCalled();
    });

    it('cadena vacía → Result.fail(BucketInvalidoError)', async () => {
      const result = await useCase.execute({
        userId: 'user-1',
        bucket: '',
        periodo: '2026-07',
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(BucketInvalidoError);
    });
  });

  describe('periodo inválido', () => {
    it('bucket válido + periodo inválido → Result.fail(PeriodoInvalidoError), reader NUNCA llamado', async () => {
      const result = await useCase.execute({
        userId: 'user-1',
        bucket: Bucket.Necesidades,
        periodo: '2026-13',
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PeriodoInvalidoError);
      expect(readerMock.findByPeriodoYBucket).not.toHaveBeenCalled();
    });
  });

  describe('bucket + periodo válidos', () => {
    it('retorna Result.ok con periodo, bucket y transacciones pasadas del reader', async () => {
      const rows = [makeRow(), makeRow({ id: 'tx-002' })];
      readerMock.findByPeriodoYBucket.mockResolvedValue(rows);

      const result = await useCase.execute({
        userId: 'user-1',
        bucket: Bucket.Necesidades,
        periodo: '2026-07',
      });

      expect(result.isOk()).toBe(true);
      const data = result.getValue();
      expect(data.periodo).toBe('2026-07');
      expect(data.bucket).toBe(Bucket.Necesidades);
      expect(data.transacciones).toEqual(rows);
    });

    it('resultado vacío es Result.ok (no un error)', async () => {
      readerMock.findByPeriodoYBucket.mockResolvedValue([]);

      const result = await useCase.execute({
        userId: 'user-1',
        bucket: Bucket.SinCategoria,
        periodo: '2026-07',
      });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().transacciones).toEqual([]);
    });

    it('llama al reader con el userId, PeriodoMes resuelto y el Bucket correctos', async () => {
      readerMock.findByPeriodoYBucket.mockResolvedValue([makeRow()]);

      await useCase.execute({
        userId: 'user-42',
        bucket: Bucket.Ahorro,
        periodo: '2026-07',
      });

      expect(readerMock.findByPeriodoYBucket).toHaveBeenCalledTimes(1);
      const [calledUserId, calledPeriodo, calledBucket] =
        readerMock.findByPeriodoYBucket.mock.calls[0];
      expect(calledUserId).toBe('user-42');
      expect(calledPeriodo.valor).toBe('2026-07');
      expect(calledBucket).toBe(Bucket.Ahorro);
    });
  });

  describe('periodo ausente (undefined)', () => {
    it('usa PeriodoMes.actual() y llama al reader con el mes actual', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-15T12:00:00.000Z'));

      readerMock.findByPeriodoYBucket.mockResolvedValue([makeRow()]);

      const result = await useCase.execute({
        userId: 'user-1',
        bucket: Bucket.Necesidades,
        periodo: undefined,
      });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().periodo).toBe('2026-07');
      const [, calledPeriodo] = readerMock.findByPeriodoYBucket.mock.calls[0];
      expect(calledPeriodo.valor).toBe('2026-07');
    });
  });
});
