import { aDetalleBucketDto } from './detalle-bucket.dto';
import { Bucket } from '../../../domain/value-objects/bucket';
import { DetalleBucketRow } from '../../../application/ports/detalle-bucket.port';
import { ObtenerDetalleBucketResult } from '../../../application/use-cases/obtener-detalle-bucket.use-case';

const makeRow = (overrides: Partial<DetalleBucketRow> = {}): DetalleBucketRow => ({
  id: 'tx-001',
  fecha: new Date('2026-07-10T14:30:00.000Z'),
  descripcion: 'Compra supermercado',
  cargo: 50000n,
  abono: 0n,
  banco: 'BCI',
  tipoCuenta: 'Cuenta Corriente',
  numeroCuenta: '12345678',
  categoria: null,
  ...overrides,
});

describe('aDetalleBucketDto', () => {
  it('serializa cargo/abono como decimal string, nunca number', () => {
    const data: ObtenerDetalleBucketResult = {
      periodo: '2026-07',
      bucket: Bucket.Necesidades,
      transacciones: [makeRow({ cargo: 9007199254740993n, abono: 0n })],
    };

    const dto = aDetalleBucketDto(data);

    expect(dto.transacciones[0]!.cargo).toBe('9007199254740993');
    expect(typeof dto.transacciones[0]!.cargo).toBe('string');
    expect(dto.transacciones[0]!.abono).toBe('0');
  });

  it('serializa fecha como ISO-8601 UTC completo via toISOString()', () => {
    const data: ObtenerDetalleBucketResult = {
      periodo: '2026-07',
      bucket: Bucket.Necesidades,
      transacciones: [makeRow({ fecha: new Date('2026-07-10T14:30:00.000Z') })],
    };

    const dto = aDetalleBucketDto(data);

    expect(dto.transacciones[0]!.fecha).toBe('2026-07-10T14:30:00.000Z');
  });

  it('bucket refleja el valor validado en el envelope', () => {
    const data: ObtenerDetalleBucketResult = {
      periodo: '2026-07',
      bucket: Bucket.SinCategoria,
      transacciones: [],
    };

    const dto = aDetalleBucketDto(data);

    expect(dto.bucket).toBe(Bucket.SinCategoria);
    expect(dto.periodo).toBe('2026-07');
    expect(dto.transacciones).toEqual([]);
  });

  it('mapea banco/tipoCuenta/numeroCuenta sin transformación', () => {
    const data: ObtenerDetalleBucketResult = {
      periodo: '2026-07',
      bucket: Bucket.Necesidades,
      transacciones: [makeRow({ banco: 'Santander', tipoCuenta: 'Cuenta Corriente', numeroCuenta: 'X-1' })],
    };

    const dto = aDetalleBucketDto(data);

    expect(dto.transacciones[0]!.banco).toBe('Santander');
    expect(dto.transacciones[0]!.tipoCuenta).toBe('Cuenta Corriente');
    expect(dto.transacciones[0]!.numeroCuenta).toBe('X-1');
    expect(dto.transacciones[0]!.id).toBe('tx-001');
    expect(dto.transacciones[0]!.descripcion).toBe('Compra supermercado');
  });
});
