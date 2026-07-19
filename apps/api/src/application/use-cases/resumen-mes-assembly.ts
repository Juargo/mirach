import { ResumenMes } from '../../domain/value-objects/resumen-mes';
import { Bucket } from '../../domain/value-objects/bucket';
import { BucketSumRow } from '../ports/resumen-mes.port';

/**
 * construirResumenMesDesdeFilas — assembles a ResumenMes from raw bucket sum
 * rows for a single month.
 *
 * Extracted into its own application-layer module (DRY) so both
 * CalcularResumenMesUseCase (US-015) and CalcularResumenAnualUseCase (US-030)
 * depend on this shared assembly seam instead of the annual path coupling to
 * the monthly use-case's file. Never fails — ResumenMes.crear() handles the
 * sinIngreso (base=0n) case.
 */
export function construirResumenMesDesdeFilas(
  rows: ReadonlyArray<BucketSumRow>,
): ResumenMes {
  const rowMap = new Map<Bucket, BucketSumRow>();
  for (const row of rows) {
    rowMap.set(row.bucket, row);
  }

  // Income base = Ingreso bucket's totalAbono (0n if month has no income rows)
  const totalIngreso = rowMap.get(Bucket.Ingreso)?.totalAbono ?? 0n;

  // Spend sums: use totalCargo for each spend bucket (0n if row absent)
  const necesidades = rowMap.get(Bucket.Necesidades)?.totalCargo ?? 0n;
  const deseos = rowMap.get(Bucket.Deseos)?.totalCargo ?? 0n;
  const ahorro = rowMap.get(Bucket.Ahorro)?.totalCargo ?? 0n;
  const sinCategoria = rowMap.get(Bucket.SinCategoria)?.totalCargo ?? 0n;

  return ResumenMes.crear({
    totalIngreso,
    necesidades,
    deseos,
    ahorro,
    sinCategoria,
  });
}
