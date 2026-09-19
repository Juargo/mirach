import { Result } from '../../shared/result';
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import { PeriodoInvalidoError } from '../../domain/errors/periodo-invalido.error';
import { IUltimoPeriodoConDatosReader } from '../ports/ultimo-periodo-con-datos.port';

/**
 * resolverPeriodo — assembly compartida de resolución de período (issue
 * #747, DRY). Reemplaza el ternario `input.periodo === undefined ?
 * PeriodoMes.actual() : PeriodoMes.crear(input.periodo)` que estaba
 * duplicado en los 6 use cases de lectura mensual (calcular-resumen-mes,
 * obtener-semaforo-detalle, obtener-detalle-bucket, obtener-detalle-bucket-mes,
 * obtener-movimientos-mes, obtener-ingresos-mes).
 *
 * Decisión de producto: un período AUSENTE se resuelve al ÚLTIMO mes
 * calendario del usuario con al menos una transacción — el mes en curso
 * (`PeriodoMes.actual()`) queda como fallback SOLO cuando el usuario no
 * tiene ninguna transacción. Un período EXPLÍCITO (incluso vacío o
 * inválido) siempre se respeta tal cual — el reader de "último período con
 * datos" NUNCA se toca en ese caso (evita una query innecesaria y preserva
 * el comportamiento de validación existente byte a byte).
 *
 * Nunca lanza — Result<PeriodoMes, PeriodoInvalidoError>, mismo contrato de
 * error que `PeriodoMes.crear()`.
 */
export async function resolverPeriodo(
  reader: IUltimoPeriodoConDatosReader,
  userId: string,
  periodoInput: string | undefined,
): Promise<Result<PeriodoMes, PeriodoInvalidoError>> {
  if (periodoInput !== undefined) {
    // Presente (incluso '') → validar con el VO, sin tocar el reader.
    return PeriodoMes.crear(periodoInput);
  }

  // Ausente → último mes del usuario con datos; sin ninguna transacción,
  // cae a PeriodoMes.actual() (siempre válido, nunca falla).
  const ultimo = await reader.ultimoPeriodoConDatos(userId);
  return Result.ok(ultimo ?? PeriodoMes.actual());
}
