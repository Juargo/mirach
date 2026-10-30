import { Result } from '../../shared/result';
import { PeriodoInvalidoError } from '../../domain/errors/periodo-invalido.error';
import { Bucket } from '../../domain/value-objects/bucket';
import { BucketInvalidoError } from '../../domain/errors/bucket-invalido.error';
import { porcentajeBasisPoints } from '../../domain/value-objects/resumen-mes';
import {
  elegirBaseIngreso,
  FuenteIngreso,
} from '../../domain/value-objects/base-ingreso';
import { IDetalleBucketReader } from '../ports/detalle-bucket.port';
import { IResumenMesReader } from '../ports/resumen-mes.port';
import { IUltimoPeriodoConDatosReader } from '../ports/ultimo-periodo-con-datos.port';
import { ILogger } from '../ports/logger.port';
import { IPerfilPresupuestoReader } from '../ports/perfil-presupuesto.port';
import {
  agruparDetallePorCategoria,
  GrupoDetalleCategoria,
} from '../services/agrupar-detalle-por-categoria';
import { resolverPeriodo } from './resolver-periodo';
import { ingresoDetectadoDesdeFilas } from './resumen-mes-assembly';

/** Tipo de retorno del use case en caso de éxito — header + grupos (MBD-01/02). */
export interface ObtenerDetalleBucketMesResult {
  readonly periodo: string;
  /** First and last day of the financial month (#111), `YYYY-MM-DD`. */
  readonly fechaInicio: string;
  readonly fechaFin: string;
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
  /** Base of `porcentajeBp` (rule 1, #111, VIS-10): declared or detected. */
  readonly fuenteIngreso: FuenteIngreso;
  /** Grupos por categoría — transacciones ALREADY recortadas sin PII de
   *  cuenta en el borde de aplicación (MBD-08, gate PR1): tipoCuenta/
   *  numeroCuenta no existen en este tipo. `banco` SÍ sobrevive como
   *  `origen` (D-02, correccion-movimientos-manuales). */
  readonly grupos: ReadonlyArray<GrupoDetalleCategoria>;
}

/**
 * Allowlist del detalle MES-BUCKET (D-08): solo los 3 buckets de gasto.
 * Ingreso (US-052, fuera de alcance), `SinCategoria` (issue #778 tramo 5b
 * PR5 — ya no existe como bucket; `GET /api/buckets/SinCategoria` ahora
 * responde 400 vía este mismo allowlist) y cualquier otro valor → 400.
 */
const BUCKETS_DETALLE_MES: ReadonlySet<string> = new Set([
  Bucket.Necesidades,
  Bucket.Deseos,
  Bucket.Ahorro,
]);

/**
 * ObtenerDetalleBucketMesUseCase — use case de lectura para US-051.
 *
 * Orquesta los DOS readers existentes (D-02 — cero SQL/ports nuevos):
 * `IDetalleBucketReader.findByPeriodoYBucket` (filas del bucket, ya
 * categoria-folded y descifradas) + `IResumenMesReader.sumarPorBucket`
 * (ingreso detectado del mes = `Ingreso.totalAbono`; la base del % es el
 * ingreso declarado cuando existe, regla 1 de #111), y ensambla el header
 * (MBD-01) + los grupos por categoría (MBD-02) vía el servicio puro
 * `agruparDetallePorCategoria`.
 *
 * Periodo (issue #747): ausente → último mes del usuario con datos
 * (`resolverPeriodo`, fallback `PeriodoMes.actual()` sin ninguna
 * transacción); inválido → 400 (MBD-04, misma disciplina que el flat
 * US-017 y el semáforo US-049).
 * Un mes vacío del bucket es Result.ok con totales en cero (MBD-01), nunca
 * un error. Never throws (Result<T,E>).
 */
export class ObtenerDetalleBucketMesUseCase {
  constructor(
    private readonly reader: IDetalleBucketReader,
    private readonly resumenReader: IResumenMesReader,
    private readonly ultimoPeriodoReader: IUltimoPeriodoConDatosReader,
    private readonly logger: ILogger,
    private readonly perfilReader: IPerfilPresupuestoReader,
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

    // 2. Periodo (MBD-04): ausente → último mes con datos (fallback mes
    //    actual); presente → validar VO.
    // The cut-off day of the user's financial month (#111) defines the period.
    const perfil = await this.perfilReader.obtener(input.userId);
    const periodoResult = await resolverPeriodo(
      this.ultimoPeriodoReader,
      input.userId,
      input.periodo,
      perfil.mesFinanciero.diaCorte,
    );
    if (periodoResult.isFail()) {
      return Result.fail(periodoResult.getError());
    }
    const periodoVO = periodoResult.getValue();

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

    // 4. Base of the percentage (rule 1, #111): the declared income, or the
    //    detected one (Ingreso totalAbono, same reader as /resumen).
    const base = elegirBaseIngreso(
      perfil.mesFinanciero.ingresoDeclarado,
      ingresoDetectadoDesdeFilas(resumenRows),
    );

    const grupos = agruparDetallePorCategoria(rows);
    const total = rows.reduce((acumulado, fila) => acumulado + fila.cargo, 0n);

    // 5. Header (MBD-01/03/05, D-04/D-05): metaBp null ⇒ porcentajeBp null
    //    (SinCategoria); si hay meta, % single-shot round-half-up vs los
    //    valores crudos (nunca sobre un valor ya redondeado).
    //    The goal comes from the user's budget profile (#110, PER-06).
    const metaBp = perfil.metas[bucket as keyof typeof perfil.metas] ?? null;
    const porcentajeBp =
      metaBp === null ? null : porcentajeBasisPoints(total, base.monto);

    this.logger.debug('obtener-detalle-bucket-mes: computed', {
      periodo: periodoVO.valor,
      bucket,
      totalTransacciones: rows.length,
      totalCategorias: grupos.length,
    });

    return Result.ok({
      periodo: periodoVO.valor,
      fechaInicio: periodoVO.fechaInicio,
      fechaFin: periodoVO.fechaFin,
      bucket,
      total,
      totalTransacciones: rows.length,
      totalCategorias: grupos.length,
      porcentajeBp,
      metaBp,
      fuenteIngreso: base.fuente,
      grupos,
    });
  }
}
