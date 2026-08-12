/**
 * PerfilDemoSoloLecturaError — error de dominio.
 *
 * Se produce cuando una sesión demo (`esDemo: true`) intenta ejecutar
 * cualquiera de las 2 mutaciones de perfil (`PATCH /api/perfil`,
 * `PATCH /api/perfil/password`) — PERF040-08. Clase propia, mismo código
 * `DEMO_SOLO_LECTURA` que `CatalogoDemoSoloLecturaError`, pero SIN reusar
 * esa clase: arrastraría la unión de errores del catálogo al traductor
 * exhaustivo de perfil (design.md D-05 — "tercera ocurrencia ⇒
 * generalizar", no la segunda).
 */
export class PerfilDemoSoloLecturaError extends Error {
  constructor() {
    super(
      'Tu cuenta demo es de solo lectura. Creá una cuenta para editar tu perfil.',
    );
    this.name = 'PerfilDemoSoloLecturaError';
  }
}
