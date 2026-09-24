import { ETIQUETA_BUCKET_COPY } from '../value-objects/semaforo-detalle';

/**
 * CatalogoIncompletoError — error de dominio (issue #778, tramo 3).
 *
 * Se produce cuando el catálogo de categorías del usuario RESPONDIÓ (no es
 * un fallo de infraestructura) pero le falta la categoría `Desconocido` de
 * un bucket asignable — hoy, en la práctica, siempre `BUCKET_POR_DEFECTO`
 * (Deseos/"Gustos"), el único bucket que la ingesta usa como destino por
 * defecto (`application/services/categoria-por-defecto.ts`).
 *
 * Reemplaza al fail-safe silencioso que degradaba a `Bucket.SinCategoria`
 * (tramo 2): el tramo 5 ELIMINA ese bucket, así que un catálogo incompleto
 * deja de tener un destino de degradación disponible — pasa a ser un error
 * de CONFIGURACIÓN explícito, no algo que la ingesta pueda absorber en
 * silencio.
 *
 * ⚠️ El usuario NO puede resolverlo desde la app, y el mensaje NO debe
 * sugerirle que sí. Se comprobó en producción (2026-09-24): la primera
 * versión de este copy decía "restaura o crea esa categoría", y las dos
 * cosas son callejones sin salida. La `Desconocido` es una categoría del
 * sistema: está protegida contra edición y borrado
 * (`CategoriaInternaProtegidaError`), y una que el usuario cree a mano
 * nacería con `esInterna = false` — invisible para
 * `seleccionarCategoriaInterna`, que es lo único que este guard consulta. Y
 * si ya existe sin marcar (el caso REAL y más frecuente, todo catálogo
 * anterior a #781), crear otra choca contra
 * `@@unique([userId, bucketId, nombre])`.
 *
 * La remediación es de operador: `prisma/marcar-categorias-internas.ts`
 * cuando la fila existe sin marcar, `prisma/backfill-catalogo-faltante.ts`
 * cuando no existe. Eso NO va en el mensaje — es lenguaje de operador, no
 * de usuario final.
 *
 * Distinto de un catálogo CAÍDO (fallo de infraestructura — `Result.fail` de
 * `ICatalogoClasificacion.findAll`/`buscarCategoriaPorDefecto`): esa isla
 * degradable NO se toca por este cambio y sigue sin rechazar (ver
 * `ProcessIngestaUseCase.runCategorizacion` / `apps/api/CLAUDE.md`).
 *
 * El mensaje usa la etiqueta de PRODUCTO del bucket (`ETIQUETA_BUCKET_COPY`,
 * "Gustos" para `Bucket.Deseos`), no el nombre de dominio — es lo que el
 * usuario ve en la UI del catálogo, y es la MISMA fuente que ya usa el
 * copy generado en backend para el semáforo (DRY — no se inventa un mapa
 * nuevo).
 *
 * El constructor solo recibe `bucket` — ningún dato de la transacción ni del
 * archivo, garantía estructural de que este error nunca puede filtrar datos
 * sensibles (ADR-013), igual que `SinMovimientosError`.
 */
export class CatalogoIncompletoError extends Error {
  constructor(readonly bucket: keyof typeof ETIQUETA_BUCKET_COPY) {
    super(
      `No pudimos clasificar los movimientos: falta la categoría Desconocido de ${ETIQUETA_BUCKET_COPY[bucket]} en tu catálogo. ` +
        `Es una categoría del sistema, así que no se puede crear ni restaurar desde la app: hay que resolverlo por dentro. ` +
        `Tu archivo está bien y no se importó nada.`,
    );
    this.name = 'CatalogoIncompletoError';
  }
}
