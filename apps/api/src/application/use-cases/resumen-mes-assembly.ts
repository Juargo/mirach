import { ResumenMes } from '../../domain/value-objects/resumen-mes';
import { Bucket } from '../../domain/value-objects/bucket';
import { BucketSumRow } from '../ports/resumen-mes.port';
import { MetasPresupuesto } from '../../domain/value-objects/perfil-presupuesto';

/**
 * ingresoDetectadoDesdeFilas — detected income of a month: the Ingreso
 * bucket's totalAbono (0n when the month has no income rows). The single
 * place that reads it from bucket sum rows, shared by the monthly summary
 * assembly and the bucket detail header (#111).
 */
export function ingresoDetectadoDesdeFilas(
  rows: ReadonlyArray<BucketSumRow>,
): bigint {
  return rows.find((row) => row.bucket === Bucket.Ingreso)?.totalAbono ?? 0n;
}

/**
 * construirResumenMesDesdeFilas — assembles a ResumenMes from raw bucket sum
 * rows for a single month.
 *
 * Extracted into its own application-layer module (DRY) so both
 * CalcularResumenMesUseCase (US-015) and CalcularResumenAnualUseCase (US-030)
 * depend on this shared assembly seam instead of the annual path coupling to
 * the monthly use-case's file. Never fails — ResumenMes.crear() handles the
 * sinIngreso (base=0n) case. `metas` are the user's budget profile goals
 * (#110) and `ingresoDeclarado` the declared monthly income (#111, rule 1),
 * the same for every month (PER-06).
 */
export function construirResumenMesDesdeFilas(
  rows: ReadonlyArray<BucketSumRow>,
  metas: MetasPresupuesto,
  ingresoDeclarado: bigint | null,
): ResumenMes {
  const rowMap = new Map<Bucket, BucketSumRow>();
  for (const row of rows) {
    rowMap.set(row.bucket, row);
  }

  // Spend sums: use totalCargo for each spend bucket (0n if row absent)
  const necesidades = rowMap.get(Bucket.Necesidades)?.totalCargo ?? 0n;
  const deseos = rowMap.get(Bucket.Deseos)?.totalCargo ?? 0n;
  const ahorro = rowMap.get(Bucket.Ahorro)?.totalCargo ?? 0n;

  // A month without any movement has no verdict (#111): the declared income
  // applies only to a month with data, so an empty month — a future month of
  // the annual view, say — stays `sinIngreso` instead of showing Ahorro red.
  const sinMovimientos = rows.every(
    (row) => row.totalCargo === 0n && row.totalAbono === 0n,
  );

  return ResumenMes.crear(
    {
      totalIngreso: ingresoDetectadoDesdeFilas(rows),
      necesidades,
      deseos,
      ahorro,
    },
    metas,
    sinMovimientos ? null : ingresoDeclarado,
  );
}
