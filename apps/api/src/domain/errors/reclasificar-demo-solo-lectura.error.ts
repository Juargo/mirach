/**
 * ReclasificarDemoSoloLecturaError — error de dominio.
 *
 * Se produce cuando una sesión demo (`esDemo: true`) intenta ejecutar
 * `PATCH /api/transacciones/:id/categoria` (reclasificación manual de una
 * transacción, US-013). Mismo código `DEMO_SOLO_LECTURA` que
 * `MovimientoDemoSoloLecturaError` / `ReevaluarDemoSoloLecturaError` /
 * `IngestaDemoSoloLecturaError` / `CatalogoDemoSoloLecturaError` /
 * `PerfilDemoSoloLecturaError`, pero SIN reusar esas clases — arrastraría la
 * unión de errores de otro dominio al traductor exhaustivo de esta ruta
 * (mismo motivo documentado en las clases hermanas; design.md D-05 evaluó y
 * rechazó generalizar estas clases de error — no comparten comportamiento
 * más allá del boilerplate `super(message); this.name = 'X'`). Issue #597.
 */
export class ReclasificarDemoSoloLecturaError extends Error {
  constructor() {
    super(
      'La reclasificación de transacciones no está disponible en la cuenta demo. Crea una cuenta para reclasificar tus movimientos.',
    );
    this.name = 'ReclasificarDemoSoloLecturaError';
  }
}
