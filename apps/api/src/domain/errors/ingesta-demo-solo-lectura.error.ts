/**
 * IngestaDemoSoloLecturaError — error de dominio.
 *
 * Se produce cuando una sesión demo (`esDemo: true`) intenta ejecutar
 * cualquiera de las 3 escrituras de ingesta: `DELETE /api/ingestas/:id`,
 * `POST /api/ingestas` (one-shot) y `POST /api/ingestas/commit` (issue #500).
 * `POST /api/ingestas/preview` NO gatea — es un dry-run de solo lectura, no
 * persiste nada (ver docstring de `PreviewIngestaUseCase`, CA-04). Clase
 * propia, mismo código `DEMO_SOLO_LECTURA` que `PerfilDemoSoloLecturaError`/
 * `CatalogoDemoSoloLecturaError`, pero SIN reusar esas clases — arrastraría
 * la unión de errores de otro dominio al traductor exhaustivo de ingesta
 * (mismo motivo que `PerfilDemoSoloLecturaError`).
 *
 * Esta SÍ es la tercera ocurrencia del patrón (Catálogo → Perfil → Ingesta),
 * el propio umbral de design.md D-05 ("tercera ocurrencia ⇒ generalizar") —
 * pero se difiere deliberadamente: generalizar el gate `esDemo` (p. ej.
 * fail-closed por tipo + logging de gate-trip transversal) es un cambio
 * sistémico a perfil/catálogo/ingesta a la vez, fuera del alcance quirúrgico
 * del issue #500, y queda trackeado en un follow-up aparte.
 */
export class IngestaDemoSoloLecturaError extends Error {
  constructor() {
    super(
      'Las cartolas de la cuenta demo son de solo lectura. Creá una cuenta para gestionar tus cartolas.',
    );
    this.name = 'IngestaDemoSoloLecturaError';
  }
}
