import { Result } from '../../shared/result';
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import { PeriodoInvalidoError } from '../../domain/errors/periodo-invalido.error';
import { Bucket } from '../../domain/value-objects/bucket';
import { BucketInvalidoError } from '../../domain/errors/bucket-invalido.error';
import { BANDAS_SEMAFORO } from '../../domain/value-objects/estado-semaforo';
import { porcentajeBasisPoints } from '../../domain/value-objects/resumen-mes';
import { IDetalleBucketReader } from '../ports/detalle-bucket.port';
import { IResumenMesReader } from '../ports/resumen-mes.port';
import { ILogger } from '../ports/logger.port';
import {
  agruparDetallePorCategoria,
  GrupoDetalleCategoria,
} from '../services/agrupar-detalle-por-categoria';

/** Tipo de retorno del use case en caso de éxito — header + grupos (MBD-01/02). */
export interface ObtenerDetalleBucketMesResult {
  readonly periodo: string;
  readonly bucket: Bucket;
  /** Suma de cargos del bucket en el período — BigInt hasta el DTO (CA-05). */
  readonly total: bigint;
  readonly totalTransacciones: number;
  /** = grupos.length — el grupo sintético cuenta (D-09). */
  readonly totalCategorias: number;
  /** % vs meta single-shot (D-04); null sin meta (SinCategoria) o sin ingreso. */
  readonly porcentajeBp: bigint | null;
  /** Objetivo 50/30/20 desde BANDAS_SEMAFORO; null cuando el bucket no tiene regla (D-05). */
  readonly metaBp: bigint | null;
  /** Grupos por categoría — transacciones ALREADY recortadas sin PII en el
   *  borde de aplicación (MBD-08, gate PR1): banco/tipoCuenta/numeroCuenta
   *  no existen en este tipo. */
  readonly grupos: ReadonlyArray<GrupoDetalleCategoria>;
}

/**
 * Allowlist del detalle MES-BUCKET (D-08): solo los 4 buckets de gasto.
 * Ingreso (US-052, fuera de alcance) y cualquier otro valor → 400.
 */
const BUCKETS_DETALLE_MES: ReadonlySet<string> = new Set([
  Bucket.Necesidades,
  Bucket.Deseos,
  Bucket.Ahorro,
  Bucket.SinCategoria,
]);

/**
 * ObtenerDetalleBucketMesUseCase — use case de lectura para US-051.
 *
 * Orquesta los DOS readers existentes (D-02 — cero SQL/ports nuevos):
 * `IDetalleBucketReader.findByPeriodoYBucket` (filas del bucket, ya
 * categoria-folded y descifradas) + `IResumenMesReader.sumarPorBucket`
 * (base de ingresos del mes = `Ingreso.totalAbono`), y ensambla el header
 * (MBD-01) + los grupos por categoría (MBD-02) vía el servicio puro
 * `agruparDetallePorCategoria`.
 *
 * Periodo: ausente → `PeriodoMes.actual()`; inválido → 400
 * (MBD-04, misma disciplina que el flat US-017 y el semáforo US-049).
 * Un mes vacío del bucket es Result.ok con totales en cero (MBD-01), nunca
 * un error. Never throws (Result<T,E>).
 */
export class ObtenerDetalleBucketMesUseCase {
  constructor(
    private readonly reader: IDetalleBucketReader,
    private readonly resumenReader: IResumenMesReader,
    private readonly logger: ILogger,
  ) {}

  async execute(input: {
    userId: string;
    bucket: string; // raw path param
    periodo: string | undefined;
  }): Promise<
    Result<
      ObtenerDetalleBucketMesResult,
      BucketInvalidoError | PeriodoInvalidoError
    >
  > {
    // 1. Allowlist (D-08): valida antes que nada — nunca tocar los readers
    //    con un bucket fuera de alcance.
    if (!BUCKETS_DETALLE_MES.has(input.bucket)) {
      return Result.fail(new BucketInvalidoError(input.bucket));
    }
    const bucket = input.bucket as Bucket;

    // 2. Periodo (MBD-04): ausente → mes actual; presente → validar VO.
    let periodoVO: PeriodoMes;
    if (input.periodo === undefined) {
      periodoVO = PeriodoMes.actual();
    } else {
      const resultado = PeriodoMes.crear(input.periodo);
      if (resultado.isFail()) {
        return Result.fail(resultado.getError());
      }
      periodoVO = resultado.getValue();
    }

    // 3. Ambos readers (D-02): filas del bucket + base de ingresos del mes.
    const [rows, resumenRows] = await Promise.all([
      this.reader.findByPeriodoYBucket(input.userId, periodoVO, bucket),
      this.resumenReader.sumarPorBucket(input.userId, periodoVO),
    ]);
    // Counts only — never montos/descripcion/numeroCuenta (ADR-013).
    this.logger.debug('obtener-detalle-bucket-mes: repo fetch', {
      userId: input.userId,
      periodo: periodoVO.valor,
      bucket,
      transacciones: rows.length,
      resumenRows: resumenRows.length,
    });

    // 4. Base de ingresos = totalAbono del bucket Ingreso (0n sin ingresos).
    //    Misma regla que lee construirResumenMesDesdeFilas (D-02 — 2ª
    //    ocurrencia; extraer en la 3ª).
    const ingreso =
      resumenRows.find((row) => row.bucket === Bucket.Ingreso)?.totalAbono ??
      0n;

    const grupos = agruparDetallePorCategoria(rows);
    const total = rows.reduce((acumulado, fila) => acumulado + fila.cargo, 0n);

    // 5. Header (MBD-01/03/05, D-04/D-05): metaBp null ⇒ porcentajeBp null
    //    (SinCategoria); si hay meta, % single-shot round-half-up vs los
    //    valores crudos (nunca sobre un valor ya redondeado).
    const metaBp =
      BANDAS_SEMAFORO[bucket as keyof typeof BANDAS_SEMAFORO]?.metaBp ?? null;
    const porcentajeBp =
      metaBp === null ? null : porcentajeBasisPoints(total, ingreso);

    this.logger.debug('obtener-detalle-bucket-mes: computed', {
      periodo: periodoVO.valor,
      bucket,
      totalTransacciones: rows.length,
      totalCategorias: grupos.length,
    });

    return Result.ok({
      periodo: periodoVO.valor,
      bucket,
      total,
      totalTransacciones: rows.length,
      totalCategorias: grupos.length,
      porcentajeBp,
      metaBp,
      grupos,
    });
  }
}
