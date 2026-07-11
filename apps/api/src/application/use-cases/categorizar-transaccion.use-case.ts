import { Result } from '../../shared/result';
import { Bucket } from '../../domain/value-objects/bucket';
import { PatronClasificacion } from '../../domain/value-objects/patron-clasificacion';

/** Datos mínimos de una transacción necesarios para la clasificación. */
export interface TransaccionInput {
  readonly descripcion: string;
  readonly abono: bigint;
  readonly cargo: bigint;
}

/** Resultado de la clasificación: siempre ok (nunca falla por transacción). */
export interface CategorizarTransaccionResult {
  readonly bucket: Bucket;
}

/**
 * CategorizarTransaccionUseCase — clasifica UNA transacción en su bucket.
 *
 * Algoritmo (R-02, R-03, R-04):
 *   1. Ingreso rule: abono > 0 AND cargo === 0 → Bucket.Ingreso (sin consultar patrones).
 *   2. Ordenar patrones por prioridad asc, luego id asc (tiebreak determinístico).
 *   3. Primera coincidencia (PatronClasificacion.coincide) → ese bucket.
 *   4. Fallback: Bucket.SinCategoria.
 *
 * Contrato: retorna Result<{bucket},never> — SIEMPRE ok. Nunca lanza.
 * La degradación a SinCategoria ocurre aquí, no en el orquestador.
 */
export class CategorizarTransaccionUseCase {
  execute(
    transaccion: TransaccionInput,
    patrones: ReadonlyArray<PatronClasificacion>,
  ): Result<CategorizarTransaccionResult, never> {
    // 1. Ingreso rule — tiene prioridad sobre todo el catálogo.
    if (transaccion.abono > 0n && transaccion.cargo === 0n) {
      return Result.ok({ bucket: Bucket.Ingreso });
    }

    // 2. Ordenar por prioridad asc, luego id asc como tiebreak.
    const ordenados = [...patrones].sort((a, b) => {
      if (a.prioridad !== b.prioridad) return a.prioridad - b.prioridad;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    // 3. Primera coincidencia gana.
    for (const patron of ordenados) {
      if (patron.coincide(transaccion.descripcion)) {
        return Result.ok({ bucket: patron.bucket });
      }
    }

    // 4. Fallback.
    return Result.ok({ bucket: Bucket.SinCategoria });
  }
}
