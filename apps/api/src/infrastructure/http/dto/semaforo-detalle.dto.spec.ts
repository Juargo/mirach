import { Bucket } from '../../../domain/value-objects/bucket';
import { EstadoSemaforo } from '../../../domain/value-objects/estado-semaforo';
import type { SemaforoDetalle } from '../../../domain/value-objects/semaforo-detalle';
import { aSemaforoDetalleDto } from './semaforo-detalle.dto';

/**
 * `aSemaforoDetalleDto` — mapper spec (US-049, design §1.6). Mirrors
 * `resumen-mes.dto.spec.ts`'s BigInt-safety discipline: money as decimal
 * strings, bp/meta/band edges as JS numbers (≤ 10000 ≪ 2^53), estados via
 * the lowercase wire enum (`aWire()`, duplicated 3-liner per D-05/kiss.md).
 */
function makeDetalle(
  overrides: Partial<SemaforoDetalle> = {},
): SemaforoDetalle {
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
    ...overrides,
  };
}

describe('aSemaforoDetalleDto', () => {
  it('serializes BigInt money fields (totalIngreso, consejo.monto, sinCategoria.total) as decimal strings', () => {
    const dto = aSemaforoDetalleDto('2026-07', makeDetalle());

    expect(dto.totalIngreso).toBe('1500000');
    expect(typeof dto.totalIngreso).toBe('string');
    expect(dto.buckets[0]?.consejo?.monto).toBe('49995');
    expect(typeof dto.buckets[0]?.consejo?.monto).toBe('string');
    expect(dto.sinCategoria.total).toBe('90000');
    expect(typeof dto.sinCategoria.total).toBe('string');
  });

  it('serializes porcentajeBp/metaBp/band edges as JS numbers', () => {
    const dto = aSemaforoDetalleDto('2026-07', makeDetalle());
    const necesidades = dto.buckets[0];

    expect(typeof necesidades.porcentajeBp).toBe('number');
    expect(necesidades.porcentajeBp).toBe(5333);
    expect(typeof necesidades.metaBp).toBe('number');
    expect(necesidades.metaBp).toBe(5000);
    expect(typeof necesidades.bandas.verdeMax).toBe('number');
    expect(necesidades.bandas.verdeMax).toBe(5000);
    expect(typeof necesidades.bandas.amarilloMax).toBe('number');
    expect(necesidades.bandas.amarilloMax).toBe(6000);
  });

  it('serializes estados via the lowercase wire enum (estadoGlobal + per-bucket estadoSemaforo)', () => {
    const dto = aSemaforoDetalleDto('2026-07', makeDetalle());

    expect(dto.estadoGlobal).toBe('amarillo');
    expect(dto.buckets[0]?.estadoSemaforo).toBe('amarillo');
    expect(dto.buckets[1]?.estadoSemaforo).toBe('verde');
  });

  it('keeps consejo null when the bucket has no advice (Verde)', () => {
    const dto = aSemaforoDetalleDto('2026-07', makeDetalle());

    expect(dto.buckets[1]?.consejo).toBeNull();
    expect(dto.buckets[2]?.consejo).toBeNull();
  });

  it('preserves bandas.verdeMin: null for unilateral buckets (Necesidades/Deseos)', () => {
    const dto = aSemaforoDetalleDto('2026-07', makeDetalle());

    expect(dto.buckets[0]?.bandas.verdeMin).toBeNull();
    expect(dto.buckets[1]?.bandas.verdeMin).toBeNull();
    expect(dto.buckets[2]?.bandas.verdeMin).toBe(2000);
  });

  it('D-11 (SEM-03 exception): keeps consejo null when a bucket is non-Verde (amarillo) — the fail-closed degenerate case, not just the Verde happy path', () => {
    // SEM-03/D-11: `montoParaVerde`'s unconditional post-condition can
    // degrade to `null` even for a non-Verde bucket (e.g. pathological
    // small-base granularity). The mapper must pass that `null` through
    // verbatim, never synthesize a placeholder advice object.
    const detalle = makeDetalle();
    const detalleConNullDegenerado = {
      ...detalle,
      buckets: [
        { ...detalle.buckets[0], consejo: null },
        detalle.buckets[1],
        detalle.buckets[2],
      ],
    };

    const dto = aSemaforoDetalleDto('2026-07', detalleConNullDegenerado);

    expect(dto.buckets[0]?.estadoSemaforo).toBe('amarillo');
    expect(dto.buckets[0]?.consejo).toBeNull();
  });

  it('passes the mensaje template with the literal {monto} placeholder through unchanged (SEM-10 passthrough)', () => {
    const dto = aSemaforoDetalleDto('2026-07', makeDetalle());

    expect(dto.buckets[0]?.consejo?.mensaje).toBe(
      'Para volver a Verde, reduce {monto} en Necesidades este mes.',
    );
  });
});
