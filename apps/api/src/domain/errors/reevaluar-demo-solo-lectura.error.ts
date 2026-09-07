/**
 * ReevaluarDemoSoloLecturaError — error de dominio.
 *
 * Se produce cuando una sesión demo (`esDemo: true`) intenta ejecutar
 * `POST /api/transacciones/reevaluar` (re-clasificación masiva por
 * patrones). Mismo código `DEMO_SOLO_LECTURA` que
 * `MovimientoDemoSoloLecturaError` / `IngestaDemoSoloLecturaError` /
 * `CatalogoDemoSoloLecturaError` / `PerfilDemoSoloLecturaError`, pero SIN
 * reusar esas clases — arrastraría la unión de errores de otro dominio al
 * traductor exhaustivo de esta ruta (mismo motivo documentado en las clases
 * hermanas; design.md D-05 evaluó y rechazó generalizar estas clases de
 * error — no comparten comportamiento más allá del boilerplate
 * `super(message); this.name = 'X'`).
 */
export class ReevaluarDemoSoloLecturaError extends Error {
  constructor() {
    super(
      'La reevaluación de categorías no está disponible en la cuenta demo. Crea una cuenta para reevaluar tus transacciones.',
    );
    this.name = 'ReevaluarDemoSoloLecturaError';
  }
}
