import { Result } from '../../shared/result';
import { Bucket } from '../../domain/value-objects/bucket';
import { PatronClasificacion } from '../../domain/value-objects/patron-clasificacion';
import { Transaccion } from '../../domain/value-objects/transaccion';
import { ILogger } from '../ports/logger.port';
import {
  BUCKET_POR_DEFECTO,
  CategoriaPorDefecto,
} from '../services/categoria-por-defecto';

/** Datos mínimos de una transacción necesarios para la clasificación. */
export interface TransaccionInput {
  readonly descripcion: string;
  readonly abono: bigint;
  readonly cargo: bigint;
}

/**
 * Resultado de la clasificación: siempre ok (nunca falla por transacción).
 *
 * US-013 (CAT-03), re-tipado por ADR-037/Q5 (us-038): `categoria` es `null`
 * para Ingreso y para SinCategoria (no hay categoría que asignar en ninguno
 * de esos dos casos); cuando un patrón matchea, `categoria` es `{ id, nombre
 * }` de la fila propia del usuario que matcheó (ya no un miembro del enum
 * retirado) y `bucket` es SIEMPRE el derivado de esa categoría (`patron.bucket`,
 * getter de PatronClasificacion) — nunca un bucket independiente.
 */
export interface CategorizarTransaccionResult {
  readonly categoria: { id: string; nombre: string } | null;
  readonly bucket: Bucket;
}

/**
 * CategorizarTransaccionUseCase — clasifica UNA transacción en su categoría/bucket.
 *
 * Algoritmo (R-02, R-03, R-04, CAT-03):
 *   1. Ingreso rule: abono > 0 AND cargo === 0 → { categoria: null, bucket: Ingreso }
 *      (sin consultar patrones).
 *   2. Ordenar patrones por prioridad asc, luego patron (texto) asc, luego id asc
 *      (tiebreak determinístico — design.md D-08, US-037). `id` YA NO es el
 *      primer desempate: bajo copias per-user los ids son cuid()s generados,
 *      así que dos usuarios con catálogos idénticos podrían resolver una
 *      colisión de igual prioridad de forma distinta si el orden dependiera
 *      del id. `patron` es estable y user-independiente; `id` se conserva
 *      solo como desempate final para garantizar un orden total.
 *   3. Primera coincidencia (PatronClasificacion.coincide) → { categoria: patron.categoria,
 *      bucket: patron.bucket } (bucket derivado, nunca aceptado independientemente).
 *   4. Fallback (issue #778): si el caller trae `categoriaPorDefecto` (la
 *      `Desconocido` interna del bucket `BUCKET_POR_DEFECTO`, resuelta por
 *      `seleccionarCategoriaPorDefecto`), la transacción sin coincidencia se
 *      asigna ahí → { categoria: categoriaPorDefecto, bucket: BUCKET_POR_DEFECTO }.
 *      Es un fallo RUIDOSO por diseño (ver docblock de `BUCKET_POR_DEFECTO`),
 *      no un escondite. Si `categoriaPorDefecto` es `null` (usuario previo a
 *      #738 que todavía no tiene esa fila, o degradación del catálogo aguas
 *      arriba), se conserva el fail-safe histórico: { categoria: null, bucket:
 *      SinCategoria } — pero logueando un warn, porque esa degradación
 *      silenciosa ya no debería ser el camino normal.
 *
 * Contrato: retorna Result<{categoria,bucket},never> — SIEMPRE ok. Nunca lanza.
 * La degradación (a la categoría por defecto, o a SinCategoria si no existe)
 * ocurre aquí, no en el orquestador.
 */
export class CategorizarTransaccionUseCase {
  constructor(private readonly logger: ILogger) {}

  execute(
    transaccion: TransaccionInput,
    patrones: ReadonlyArray<PatronClasificacion>,
    categoriaPorDefecto: CategoriaPorDefecto | null,
  ): Result<CategorizarTransaccionResult, never> {
    // 1. Ingreso rule — tiene prioridad sobre todo el catálogo. La regla vive
    //    en el VO (única fuente); aquí se evalúa sobre el read model bigint.
    if (Transaccion.esIngreso(transaccion.cargo, transaccion.abono)) {
      const resultado = { categoria: null, bucket: Bucket.Ingreso };
      this.logDecision(resultado);
      return Result.ok(resultado);
    }

    // 2. Ordenar por prioridad asc, luego patron (texto) asc, luego id asc
    //    como tiebreak final (D-08 — ver docblock de la clase).
    const ordenados = [...patrones].sort((a, b) => {
      if (a.prioridad !== b.prioridad) return a.prioridad - b.prioridad;
      if (a.patron !== b.patron) return a.patron < b.patron ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    // 3. Primera coincidencia gana.
    for (const patron of ordenados) {
      if (patron.coincide(transaccion.descripcion)) {
        const resultado = {
          categoria: {
            id: patron.categoria.id,
            nombre: patron.categoria.nombre,
          },
          bucket: patron.bucket,
        };
        this.logDecision(resultado);
        return Result.ok(resultado);
      }
    }

    // 4. Fallback (#778): la Desconocido del bucket por defecto si existe;
    //    si no, se conserva el fail-safe histórico pero logueado RUIDOSO.
    if (categoriaPorDefecto !== null) {
      const resultado = {
        categoria: categoriaPorDefecto,
        bucket: BUCKET_POR_DEFECTO,
      };
      this.logDecision(resultado);
      return Result.ok(resultado);
    }

    // Usuario sin la categoría Desconocido de BUCKET_POR_DEFECTO (previo a
    // #738) o catálogo degradado aguas arriba: se conserva SinCategoria como
    // fail-safe, pero NUNCA en silencio — un operador tiene que poder
    // encontrar y backfillear estos usuarios.
    this.logger.warn(
      'categorizar-transaccion: no hay categoría Desconocido para el bucket por defecto de este usuario — degradando a SinCategoria; correr prisma/backfill-catalogo-faltante.ts --user <id> para el usuario afectado',
    );
    const resultado = { categoria: null, bucket: Bucket.SinCategoria };
    this.logDecision(resultado);
    return Result.ok(resultado);
  }

  /** Solo el bucket/nombre de categoría (enums de configuración) — nunca la
   * descripción ni los montos de la transacción clasificada (ADR-013). */
  private logDecision(resultado: CategorizarTransaccionResult): void {
    this.logger.debug('categorizar-transaccion: classification decision', {
      bucket: resultado.bucket,
      categoria: resultado.categoria,
    });
  }
}
