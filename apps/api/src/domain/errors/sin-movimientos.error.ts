/**
 * SinMovimientosError — error de dominio.
 *
 * Se lanza cuando una cartola fue detectada correctamente (banco reconocido)
 * y su estructura es válida, pero la normalización produjo cero movimientos.
 * Es un error de dominio, no una respuesta vacía "exitosa", porque una
 * ingestión que no importa ningún movimiento nunca es el resultado que el
 * usuario espera al subir una cartola (design.md D-07/D-08).
 *
 * No podemos distinguir "no supimos leer el formato" de "el período
 * realmente no tuvo movimientos" — esa ambigüedad es el problema en sí. Por
 * eso hay un único mensaje que nombra ambas posibilidades, encabeza con la
 * que es responsabilidad nuestra, y nunca acusa al archivo del usuario
 * (D-08). Mismo patrón estructural que `PdfSinTextoError`, cuyo propio
 * docblock ya anticipaba este caso: "la forma controlada de rechazar ese
 * caso en vez de fallar silenciosamente con cero movimientos".
 *
 * El constructor recibe únicamente `(nombreArchivo, banco)` — no hay
 * parámetro de monto, fila o descripción que interpolar, garantía
 * estructural de que este error nunca puede filtrar datos sensibles
 * (ADR-013).
 */
export class SinMovimientosError extends Error {
  constructor(
    nombreArchivo: string,
    readonly banco: string,
  ) {
    super(
      `No encontramos movimientos en "${nombreArchivo}". Puede que no hayamos podido leer el ` +
        `formato de esta cartola, o que el período realmente no haya tenido movimientos. ` +
        `Si la cartola sí trae movimientos, avísanos para ajustar la lectura.`,
    );
    this.name = 'SinMovimientosError';
  }
}
