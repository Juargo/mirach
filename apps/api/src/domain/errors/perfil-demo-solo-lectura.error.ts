/**
 * PerfilDemoSoloLecturaError — error de dominio.
 *
 * Se produce cuando una sesión demo (`esDemo: true`) intenta ejecutar
 * cualquiera de las mutaciones de perfil (`PATCH /api/perfil`,
 * `PATCH /api/perfil/password`, y también `iniciar-vinculacion-google`/
 * `desvincular-google` — US-041) — PERF040-08. Clase propia, mismo código
 * `DEMO_SOLO_LECTURA` que `CatalogoDemoSoloLecturaError`, pero SIN reusar
 * esa clase: arrastraría la unión de errores del catálogo al traductor
 * exhaustivo de perfil.
 *
 * D-05 ("tercera ocurrencia ⇒ generalizar") se re-evaluó en el issue #507
 * cuando `IngestaDemoSoloLecturaError` alcanzó la tercera ocurrencia del
 * patrón — el veredicto (ver el docstring de esa clase) fue generalizar el
 * COMPORTAMIENTO transversal (fail-closed + logging), no las 3 clases de
 * error en sí: no comparten más que boilerplate, y una base class no
 * reduce código en los traductores HTTP. Se mantiene esta clase separada.
 */
export class PerfilDemoSoloLecturaError extends Error {
  constructor() {
    super(
      'Tu cuenta demo es de solo lectura. Creá una cuenta para editar tu perfil.',
    );
    this.name = 'PerfilDemoSoloLecturaError';
  }
}
