import { Bucket } from '../../../domain/value-objects/bucket';
import type { ObtenerDetalleBucketMesResult } from '../../../application/use-cases/obtener-detalle-bucket-mes.use-case';
import type { TransaccionDetalleBucketMes } from '../../../application/services/agrupar-detalle-por-categoria';
import { aDetalleBucketMesDto } from '../../http/dto/detalle-bucket-mes.dto';
import { bucketDetalleMesResponseSchema } from './bucket-detalle-mes.schema';

// ──────────────────────────────────────────────────────────────────────────────
// US-051 PR2: `bucketDetalleMesResponseSchema` — sync guarantee (per
// `buckets.schema.spec.ts`/`semaforo-detalle.schema.spec.ts` precedent):
// validado contra la salida REAL del mapper `aDetalleBucketMesDto()`, no un
// fixture a mano que pueda desviarse del contrato wire. El fixture se duplica
// desde `detalle-bucket-mes.dto.spec.ts` a propósito (kiss.md: duplicación
// pequeña tolerada — mismo patrón makeDetalle en semaforo dto/schema specs).
// ──────────────────────────────────────────────────────────────────────────────

/** Fila fuente con PII de cuenta — nunca llega al wire (MBD-08). */
interface FilaFuente {
  readonly id: string;
  readonly fecha: Date;
  readonly descripcion: string;
  readonly cargo: bigint;
  readonly banco: string;
  readonly tipoCuenta: string;
  readonly numeroCuenta: string;
}

function recortar(fila: FilaFuente): TransaccionDetalleBucketMes {
  return {
    id: fila.id,
    fecha: fila.fecha,
    descripcion: fila.descripcion,
    monto: fila.cargo,
  };
}

const PII: ReadonlyArray<FilaFuente> = [
  {
    id: 'tx-1',
    fecha: new Date('2026-07-03T00:00:00.000Z'),
    descripcion: 'Jumbo',
    cargo: 90000n,
    banco: 'BCI',
    tipoCuenta: 'Cuenta Corriente',
    numeroCuenta: '12345678',
  },
  {
    id: 'tx-2',
    fecha: new Date('2026-07-15T00:00:00.000Z'),
    descripcion: 'Santa Isabel',
    cargo: 60000n,
    banco: 'BCI',
    tipoCuenta: 'Cuenta Corriente',
    numeroCuenta: '12345678',
  },
];

function makeResult(
  overrides: Partial<Omit<ObtenerDetalleBucketMesResult, 'grupos'>> = {},
): ObtenerDetalleBucketMesResult {
  return {
    periodo: '2026-07',
    bucket: Bucket.Necesidades,
    total: 150000n,
    totalTransacciones: 2,
    totalCategorias: 1,
    porcentajeBp: 1667n,
    metaBp: 5000n,
    grupos: [
      {
        categoriaId: 'cat-comida',
        nombre: 'Comida',
        subtotal: 150000n,
        conteo: 2,
        transacciones: [recortar(PII[0]), recortar(PII[1])],
      },
    ],
    ...overrides,
  };
}

describe('bucketDetalleMesResponseSchema (sync guarantee)', () => {
  it('parsea la salida REAL de aDetalleBucketMesDto() sin lanzar (sync guarantee)', () => {
    const dto = aDetalleBucketMesDto(makeResult());

    expect(() => bucketDetalleMesResponseSchema.parse(dto)).not.toThrow();
  });

  it('rechaza un payload donde monto se envía como JSON number y no string (money-guard-at-the-boundary, MBD-05)', () => {
    const dto = aDetalleBucketMesDto(makeResult());
    const invalid = {
      ...dto,
      grupos: dto.grupos.map((g) => ({
        ...g,
        transacciones: g.transacciones.map((tx) => ({
          ...tx,
          monto: 12.5,
        })),
      })),
    };

    expect(() => bucketDetalleMesResponseSchema.parse(invalid)).toThrow();
  });

  it('MBD-08: rechaza una transacción con un key extra (p.ej. banco) — el leaf transacción es .strict()', () => {
    const dto = aDetalleBucketMesDto(makeResult());
    const invalid = {
      ...dto,
      grupos: dto.grupos.map((g) => ({
        ...g,
        transacciones: g.transacciones.map((tx) => ({
          ...tx,
          banco: 'BCI',
        })),
      })),
    };

    expect(() => bucketDetalleMesResponseSchema.parse(invalid)).toThrow();
  });
});
