import { Result } from '../../shared/result';
import { Bucket } from '../../domain/value-objects/bucket';
import { Categoria } from '../../domain/value-objects/categoria';
import { PatronClasificacion } from '../../domain/value-objects/patron-clasificacion';
import { Transaccion } from '../../domain/value-objects/transaccion';

/** Datos mínimos de una transacción necesarios para la clasificación. */
export interface TransaccionInput {
  readonly descripcion: string;
  readonly abono: bigint;
  readonly cargo: bigint;
}

/**
 * Resultado de la clasificación: siempre ok (nunca falla por transacción).
 *
 * US-013 (CAT-03): `categoria` es `null` para Ingreso y para SinCategoria
 * (no hay categoría que asignar en ninguno de esos dos casos); cuando un
 * patrón matchea, `categoria` es la del patrón y `bucket` es SIEMPRE el
 * derivado de esa categoría (`patron.bucket`, getter de PatronClasificacion)
 * — nunca un bucket independiente.
 */
export interface CategorizarTransaccionResult {
  readonly categoria: Categoria | null;
  readonly bucket: Bucket;
}

/**
 * CategorizarTransaccionUseCase — clasifica UNA transacción en su categoría/bucket.
 *
 * Algoritmo (R-02, R-03, R-04, CAT-03):
 *   1. Ingreso rule: abono > 0 AND cargo === 0 → { categoria: null, bucket: Ingreso }
 *      (sin consultar patrones).
 *   2. Ordenar patrones por prioridad asc, luego id asc (tiebreak determinístico).
 *   3. Primera coincidencia (PatronClasificacion.coincide) → { categoria: patron.categoria,
 *      bucket: patron.bucket } (bucket derivado, nunca aceptado independientemente).
 *   4. Fallback: { categoria: null, bucket: SinCategoria }.
 *
 * Contrato: retorna Result<{categoria,bucket},never> — SIEMPRE ok. Nunca lanza.
 * La degradación a SinCategoria ocurre aquí, no en el orquestador.
 */
export class CategorizarTransaccionUseCase {
  execute(
    transaccion: TransaccionInput,
    patrones: ReadonlyArray<PatronClasificacion>,
  ): Result<CategorizarTransaccionResult, never> {
    // 1. Ingreso rule — tiene prioridad sobre todo el catálogo. La regla vive
    //    en el VO (única fuente); aquí se evalúa sobre el read model bigint.
    if (Transaccion.esIngreso(transaccion.cargo, transaccion.abono)) {
      return Result.ok({ categoria: null, bucket: Bucket.Ingreso });
    }

    // 2. Ordenar por prioridad asc, luego id asc como tiebreak.
    const ordenados = [...patrones].sort((a, b) => {
      if (a.prioridad !== b.prioridad) return a.prioridad - b.prioridad;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    // 3. Primera coincidencia gana.
    for (const patron of ordenados) {
      if (patron.coincide(transaccion.descripcion)) {
        return Result.ok({ categoria: patron.categoria, bucket: patron.bucket });
      }
    }

    // 4. Fallback.
    return Result.ok({ categoria: null, bucket: Bucket.SinCategoria });
  }
}
