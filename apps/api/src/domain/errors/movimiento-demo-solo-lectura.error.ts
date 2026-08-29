/**
 * MovimientoDemoSoloLecturaError — error de dominio.
 *
 * Se produce cuando una sesión demo (`esDemo: true`) intenta ejecutar
 * `DELETE /api/movimientos/:id` (correccion-movimientos-manuales, ADR-040).
 * Mismo código `DEMO_SOLO_LECTURA` que `IngestaDemoSoloLecturaError` /
 * `PerfilDemoSoloLecturaError` / `CatalogoDemoSoloLecturaError`, pero SIN
 * reusar esas clases — arrastraría la unión de errores de otro dominio al
 * traductor exhaustivo de movimientos (mismo motivo documentado en
 * `IngestaDemoSoloLecturaError`; D-05 de design.md ya evaluó y rechazó
 * generalizar estas clases de error — no comparten comportamiento más allá
 * del boilerplate `super(message); this.name = 'X'`).
 *
 * Registro del mensaje: tuteo neutro (decisión de PRODUCT.md / critique r8).
 * Los tres errores hermanos aún dicen «Creá» (voseo) — deuda de copy
 * pre-existente trackeada aparte; este error NO replica ese registro.
 */
export class MovimientoDemoSoloLecturaError extends Error {
  constructor() {
    super(
      'Los movimientos de la cuenta demo son de solo lectura. Crea una cuenta para gestionar tus movimientos.',
    );
    this.name = 'MovimientoDemoSoloLecturaError';
  }
}
