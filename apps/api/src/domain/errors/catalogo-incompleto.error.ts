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
 * de CONFIGURACIÓN explícito que el usuario tiene que resolver (recrear esa
 * categoría), no algo que la ingesta pueda absorber en silencio.
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
      `Tu catálogo de categorías está incompleto: falta la categoría Desconocido en ${ETIQUETA_BUCKET_COPY[bucket]}. ` +
        `No podemos clasificar los movimientos sin ella. Restaura o crea esa categoría en tu catálogo antes de volver a intentarlo.`,
    );
    this.name = 'CatalogoIncompletoError';
  }
}
