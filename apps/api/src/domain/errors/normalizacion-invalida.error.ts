/**
 * Tipos de problemas que se reportan al normalizar transacciones (US-007).
 *
 *   FilaSinMontos     → la fila no tiene ni cargo ni abono (ambas celdas vacías).
 *   FechaIninterpretable → no fue posible parsear la fecha al formato canónico.
 *   MontoIninterpretable → cargo o abono no se pudo convertir a entero.
 */
export type ProblemaNormalizacion =
  | { tipo: 'FilaSinMontos'; fila: number }
  | { tipo: 'FechaIninterpretable'; fila: number; valor: string }
  // MontoIninterpretable no transporta el valor crudo: es un dato sensible que
  // termina en PersistenciaFallidaError.causa (persistido/logueado). Fila y
  // columna bastan para ubicar la celda.
  | { tipo: 'MontoIninterpretable'; fila: number; columna: string };

export class NormalizacionInvalidaError extends Error {
  constructor(
    public readonly banco: string,
    public readonly problemas: ReadonlyArray<ProblemaNormalizacion>,
  ) {
    super(NormalizacionInvalidaError.formatear(banco, problemas));
    this.name = 'NormalizacionInvalidaError';
  }

  private static formatear(
    banco: string,
    problemas: ReadonlyArray<ProblemaNormalizacion>,
  ): string {
    const partes = problemas.map((p) => {
      switch (p.tipo) {
        case 'FilaSinMontos':
          return `Fila ${p.fila}: no tiene ni cargo ni abono.`;
        case 'FechaIninterpretable':
          // No se interpola el valor crudo: podría filtrar datos sensibles
          // (este error termina, sin envolver, en respuestas HTTP 400).
          return `Fila ${p.fila}: la fecha no se pudo interpretar.`;
        case 'MontoIninterpretable':
          // Ídem: el valor crudo de esta celda podría ser un monto.
          return `Fila ${p.fila}, columna "${p.columna}": el monto no se pudo interpretar.`;
      }
    });
    return `Normalización inválida para ${banco}:\n  - ${partes.join('\n  - ')}`;
  }
}
