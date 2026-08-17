import { Bucket } from '../../../domain/value-objects/bucket';
import { EstadoSemaforo } from '../../../domain/value-objects/estado-semaforo';
import type { SemaforoDetalle } from '../../../domain/value-objects/semaforo-detalle';
import { aSemaforoDetalleDto } from '../../http/dto/semaforo-detalle.dto';
import {
  semaforoDetalleQuerySchema,
  semaforoDetalleResponseSchema,
} from './semaforo-detalle.schema';

/**
 * `semaforoDetalleResponseSchema` — sync guarantee (per `resumen.schema.spec.ts`):
 * validated against the REAL `aSemaforoDetalleDto()` mapper output, not a
 * hand-built fixture that could silently drift from the wire contract.
 */
function makeDetalle(): SemaforoDetalle {
  return {
    totalIngreso: 1_500_000n,
    sinIngreso: false,
    estadoGlobal: EstadoSemaforo.Amarillo,
    diagnostico: 'Tu mes está en amarillo por Necesidades.',
    bucketsCriticos: [Bucket.Necesidades],
    buckets: [
      {
        bucket: Bucket.Necesidades,
        total: 800_000n,
        porcentajeBp: 5333n,
        estadoSemaforo: EstadoSemaforo.Amarillo,
        bandas: {
          verdeMin: null,
          verdeMax: 5000n,
          amarilloMin: null,
          amarilloMax: 6000n,
          metaBp: 5000n,
        },
        consejo: {
          direccion: 'reducir',
          monto: 49_995n,
          caso: 'excede',
          mensaje:
            'Para volver a Verde, reduce {monto} en Necesidades este mes.',
        },
      },
      {
        bucket: Bucket.Deseos,
        total: 200_000n,
        porcentajeBp: 1333n,
        estadoSemaforo: EstadoSemaforo.Verde,
        bandas: {
          verdeMin: null,
          verdeMax: 3000n,
          amarilloMin: null,
          amarilloMax: 4000n,
          metaBp: 3000n,
        },
        consejo: null,
      },
      {
        bucket: Bucket.Ahorro,
        total: 300_000n,
        porcentajeBp: 2000n,
        estadoSemaforo: EstadoSemaforo.Verde,
        bandas: {
          verdeMin: 2000n,
          verdeMax: 4000n,
          amarilloMin: 1000n,
          amarilloMax: 5000n,
          metaBp: 2000n,
        },
        consejo: null,
      },
    ],
    sinCategoria: { cantidad: 3, total: 90_000n },
  };
}

describe('semaforoDetalleQuerySchema', () => {
  it('accepts a request with no periodo at all', () => {
    expect(semaforoDetalleQuerySchema.safeParse({}).success).toBe(true);
  });
});

describe('semaforoDetalleResponseSchema (sync guarantee)', () => {
  it('parses the real aSemaforoDetalleDto() output without throwing', () => {
    const dto = aSemaforoDetalleDto('2026-07', makeDetalle());

    expect(() => semaforoDetalleResponseSchema.parse(dto)).not.toThrow();
  });

  it('rejects a payload where consejo.monto is sent as a JSON number, not a string (money-guard-at-the-boundary)', () => {
    const dto = aSemaforoDetalleDto('2026-07', makeDetalle());
    const invalid = {
      ...dto,
      buckets: dto.buckets.map((b) =>
        b.consejo === null
          ? b
          : { ...b, consejo: { ...b.consejo, monto: Number(b.consejo.monto) } },
      ),
    };

    expect(() => semaforoDetalleResponseSchema.parse(invalid)).toThrow();
  });
});
