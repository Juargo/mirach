/**
 * CatalogoDemoSoloLecturaError — error de dominio.
 *
 * Se produce cuando una sesión demo (`esDemo: true`) intenta ejecutar
 * cualquiera de las 6 mutaciones del catálogo (crear/actualizar/eliminar
 * categoría o patrón). `GET /api/categorias` permanece disponible para
 * sesiones demo. Mensaje de la misma familia UX que `DemoUploadNudge.tsx`.
 * Ver design.md D-04/D-05, CAT038-08.
 *
 * D-05 ("tercera ocurrencia ⇒ generalizar") se re-evaluó en el issue #507:
 * el veredicto fue generalizar el fail-closed + logging transversal del
 * gate (`esDemoDeSesion()`/`logDemoGateTrip()`), NO fusionar esta clase con
 * `PerfilDemoSoloLecturaError`/`IngestaDemoSoloLecturaError` — no comparten
 * comportamiento más allá de `super(message)` + `this.name`, y una base
 * class no reduce código en `aCatalogoHttpError` (matchea esta clase una
 * sola vez). Se mantiene separada (ver el docstring de
 * `IngestaDemoSoloLecturaError` para el análisis completo).
 */
export class CatalogoDemoSoloLecturaError extends Error {
  constructor() {
    super(
      'Las categorías de la cuenta demo son de solo lectura. Creá una cuenta para personalizar tu catálogo.',
    );
    this.name = 'CatalogoDemoSoloLecturaError';
  }
}
