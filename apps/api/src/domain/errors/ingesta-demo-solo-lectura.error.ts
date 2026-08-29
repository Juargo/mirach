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
 * el fail-closed y el logging transversal del gate SÍ se generalizaron
 * (issue #507: `esDemoDeSesion()` + `logDemoGateTrip()`), pero la
 * generalización de ESTAS TRES CLASES DE ERROR se evaluó y se rechazó
 * deliberadamente (issue #507): no comparten comportamiento más allá del
 * boilerplate `super(message); this.name = 'X'` — no hay lógica real que
 * DRY-ificar. Una base class ahorraría ~2 líneas por subclase a cambio de
 * una capa de indirección más, y NO reduce los traductores HTTP
 * (`aPerfilHttpError`/`aCatalogoHttpError`/`aHttpError`): cada uno matchea
 * su propia clase concreta exactamente una vez, así que colapsar a
 * `instanceof BaseClass` no ahorraría ninguna línea ahí. Se mantienen las 3
 * clases separadas — sigue siendo válido el motivo original: evitar que la
 * unión de errores de un dominio se filtre a otro (KISS/YAGNI).
 */
export class IngestaDemoSoloLecturaError extends Error {
  constructor() {
    super(
      'Las cartolas de la cuenta demo son de solo lectura. Creá una cuenta para gestionar tus cartolas.',
    );
    this.name = 'IngestaDemoSoloLecturaError';
  }
}
