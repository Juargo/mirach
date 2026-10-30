import { Bucket } from '../../domain/value-objects/bucket';
import { METAS_POR_DEFECTO } from '../../domain/value-objects/perfil-presupuesto';
import { BucketSumRow } from '../ports/resumen-mes.port';
import { construirResumenMesDesdeFilas } from './resumen-mes-assembly';

const fila = (
  bucket: Bucket,
  totalCargo: bigint,
  totalAbono: bigint,
): BucketSumRow => ({
  bucket,
  totalCargo,
  totalAbono,
  cantidadCargos: totalCargo > 0n ? 1 : 0,
});

describe('construirResumenMesDesdeFilas — declared income (#111)', () => {
  it('a month with movements uses the declared income as the base', () => {
    const resumen = construirResumenMesDesdeFilas(
      [
        fila(Bucket.Ingreso, 0n, 1_000_000n),
        fila(Bucket.Necesidades, 500_000n, 0n),
      ],
      METAS_POR_DEFECTO,
      2_000_000n,
    );
    expect(resumen.fuenteIngreso).toBe('declarado');
    expect(resumen.totalIngreso).toBe(2_000_000n);
    expect(resumen.sinIngreso).toBe(false);
  });

  it('a month without any movement stays without income: no verdict on an empty month', () => {
    const resumen = construirResumenMesDesdeFilas(
      [fila(Bucket.Ingreso, 0n, 0n), fila(Bucket.Ahorro, 0n, 0n)],
      METAS_POR_DEFECTO,
      2_000_000n,
    );
    expect(resumen.sinIngreso).toBe(true);
    expect(resumen.fuenteIngreso).toBe('detectado');
    expect(resumen.totalIngreso).toBe(0n);
    expect(resumen.buckets.every((b) => b.estadoSemaforo === null)).toBe(true);
  });

  it('a month with only spending still uses the declared income', () => {
    const resumen = construirResumenMesDesdeFilas(
      [fila(Bucket.Deseos, 100_000n, 0n)],
      METAS_POR_DEFECTO,
      2_000_000n,
    );
    expect(resumen.fuenteIngreso).toBe('declarado');
    expect(resumen.sinIngreso).toBe(false);
  });
});
