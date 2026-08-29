import { Result } from '../../shared/result';
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import { PeriodoInvalidoError } from '../../domain/errors/periodo-invalido.error';
import { Bucket } from '../../domain/value-objects/bucket';
import {
  DetalleBucketRow,
  IDetalleBucketReader,
} from '../ports/detalle-bucket.port';
import { ILogger } from '../ports/logger.port';

/**
 * TransaccionIngresoMes — proyección de transacción del detalle MES-INGRESOS
 * en el borde de la aplicación (US-052, D-02).
 *
 * Gate PR1 (MID-03/MID-06/ADR-015): SOLO {id, fecha, descripcion, origen,
 * monto} — la PII de la cuenta (tipoCuenta/numeroCuenta) se recorta AQUÍ, en
 * el límite application/infrastructure, igual que `recortarTransaccion` de
 * US-051 (MBD-08): cualquier caller del use case nunca puede verla.
 * `origen` = nombre del banco verbatim (CA-02, US-017 precedent); `"Manual"`
 * es la rama dead-code de MID-02 (`banco` es NOT NULL en producción).
 * `monto` = abono positivo del row (CA-05); BigInt hasta el DTO.
 */
export interface TransaccionIngresoMes {
  readonly id: string;
  readonly fecha: Date;
  readonly descripcion: string;
  readonly origen: string;
  readonly monto: bigint;
}

/**
 * ObtenerIngresosMesResult — resultado del use case (D-02/D-03).
 *
 * EXACTAMENTE {total, conteo, transacciones}: sin `meta`/`porcentaje`/`estado`
 * (MID-03 — los ingresos no participan de 50/30/20 como gasto) y sin echo de
 * `periodo` (MID-01 es autoritativo; un echo rompería el schema `.strict()`
 * del PR2). `total` = Σ abono en BigInt (CA-05).
 */
export interface ObtenerIngresosMesResult {
  readonly total: bigint;
  readonly conteo: number;
  readonly transacciones: ReadonlyArray<TransaccionIngresoMes>;
}

/**
 * Proyección recortada (D-02): `origen = fila.banco || 'Manual'` (MID-02).
 * 1ª ocurrencia de este patrón — la 2ª es
 * `recortarTransaccion` en `agrupar-detalle-por-categoria.ts`
 * (correccion-movimientos-manuales, design D-02). Anotado por DRY (regla de
 * los 3 strikes), no extraído todavía.
 */
function recortarTransaccionIngreso(
  fila: DetalleBucketRow,
): TransaccionIngresoMes {
  return {
    id: fila.id,
    fecha: fila.fecha,
    descripcion: fila.descripcion,
    // El `||` compila sobre `banco: string` no-nullable (MID-02/CA-02) y es
    // runtime-safe: una fila hipotética con banco vacío cae a la rama Manual.
    origen: fila.banco || 'Manual',
    monto: fila.abono,
  };
}

/**
 * ObtenerIngresosMesUseCase — use case de lectura para US-052 (PR1).
 *
 * Reutiliza el reader EXISTENTE `IDetalleBucketReader.findByPeriodoYBucket`
 * con `Bucket.Ingreso` (D-01 — cero SQL/ports/repositorios nuevos): el filtro
 * `bucket-ingreso` ya codifica la regla `esIngreso` (cargo = 0 ∧ abono > 0,
 * asignada en ingesta por `categorizar-transaccion.use-case.ts`), así que este
 * use case NO re-aplica regla de signo sobre las filas (MID-05).
 *
 * Ensambla el header (MID-01): `total` = Σ `abono` en BigInt, `conteo` =
 * cantidad de filas; proyección recortada sin PII en el borde (D-02, gate
 * PR1); orden del reader preservado (fecha asc, id asc — no se re-ordena).
 * Un mes vacío es Result.ok con `0n`/0/`[]`, nunca un error (MID-01).
 *
 * Periodo (MID-04): ausente → `PeriodoMes.actual()`; inválido → Result.fail
 * (`PeriodoInvalidoError`), el reader nunca se toca. Same disciplina que
 * US-017/US-049/US-051. Never throws (Result<T,E>).
 */
export class ObtenerIngresosMesUseCase {
  constructor(
    private readonly reader: IDetalleBucketReader,
    private readonly logger: ILogger,
  ) {}

  async execute(input: {
    userId: string;
    periodo: string | undefined;
  }): Promise<Result<ObtenerIngresosMesResult, PeriodoInvalidoError>> {
    // 1. Periodo (MID-04): ausente → mes actual; presente → validar VO.
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

    // 2. Reader existente con Bucket.Ingreso (D-01): el bucket filter
    //    codifica esIngreso — no se filtra ni se re-aplica signo acá (MID-05).
    const rows = await this.reader.findByPeriodoYBucket(
      input.userId,
      periodoVO,
      Bucket.Ingreso,
    );
    // Counts only — nunca montos/descripcion/numeroCuenta (ADR-013).
    this.logger.debug('obtener-ingresos-mes: repo fetch', {
      userId: input.userId,
      periodo: periodoVO.valor,
      transacciones: rows.length,
    });

    // 3. Header (MID-01/05, D-02): Σ abono en BigInt + proyección recortada.
    const total = rows.reduce((acumulado, fila) => acumulado + fila.abono, 0n);
    const transacciones = rows.map(recortarTransaccionIngreso);

    this.logger.debug('obtener-ingresos-mes: computed', {
      periodo: periodoVO.valor,
      conteo: transacciones.length,
    });

    return Result.ok({
      total,
      conteo: transacciones.length,
      transacciones,
    });
  }
}
