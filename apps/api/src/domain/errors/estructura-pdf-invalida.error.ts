/**
 * Tipos de problemas que se reportan al validar la estructura (Track B) O al
 * normalizar transacciones (Track C, PR4b) de un PDF.
 *
 *   AnclaFaltante   → no se encontró un encabezado esperado en ningún token del PDF.
 *   PeriodoFaltante → no se encontró el período (fecha desde/hasta), reportado
 *                     AQUÍ solo cuando aparece junto a otros problemas de
 *                     encabezado en la misma pasada (si es el ÚNICO problema,
 *                     se reporta como `RangoFechasInvalidoError` — ver
 *                     PdfjsStructureValidatorService).
 *   PdfIlegible     → el PDF no se pudo releer en esta etapa (poco común: ya
 *                     pasó por detección — Track A — sin este problema).
 *   MontoIleeible   → una fila reconocida como transacción (fecha válida)
 *                     trae texto NO VACÍO en la columna cargo/abono que no se
 *                     pudo interpretar como monto (`parsearMontoPdf` retornó
 *                     `null`) — NUNCA se trata como 0 en silencio (ADR-015,
 *                     hardening PR4b: perder un monto real sin señal
 *                     corrompería el total consolidado). No transporta el
 *                     valor crudo — es potencialmente un dato sensible.
 *   TokenSinAsignarSospechoso → una fila reconocida como transacción (fecha
 *                     válida) tiene AMBAS columnas cargo/abono vacías, pero
 *                     `agruparTokens` dejó un token con forma de monto fuera
 *                     de todos los rangos configurados (`tokensSinAsignar`)
 *                     — señal de deriva geométrica: el monto real pudo haber
 *                     caído en un hueco de configuración en vez de perderse
 *                     en silencio (hardening PR4b). No transporta el valor
 *                     crudo del token.
 */
export type ProblemaEstructuraPdf =
  | { tipo: 'AnclaFaltante'; ancla: string }
  | { tipo: 'PeriodoFaltante' }
  | { tipo: 'PdfIlegible' }
  | { tipo: 'MontoIleeible'; fila: number; columna: 'cargo' | 'abono' }
  | { tipo: 'TokenSinAsignarSospechoso'; fila: number };

/**
 * Error de dominio: la estructura del PDF no cumple lo esperado para el banco.
 *
 * Agrupa TODOS los problemas detectados en una sola pasada (mismo criterio
 * que `EstructuraInvalidaError` para Excel — US-002 nota UX: mostrar todos los
 * errores juntos, no uno a la vez).
 *
 * El mensaje interpola el nombre del banco y las anclas ESPERADAS (texto
 * propio de configuración, conocido de antemano) — NUNCA texto crudo
 * extraído del PDF (podría ser un monto, RUT u otro dato sensible).
 */
export class EstructuraPdfInvalidaError extends Error {
  constructor(
    public readonly banco: string,
    public readonly problemas: ReadonlyArray<ProblemaEstructuraPdf>,
  ) {
    super(EstructuraPdfInvalidaError.formatear(banco, problemas));
    this.name = 'EstructuraPdfInvalidaError';
  }

  private static formatear(
    banco: string,
    problemas: ReadonlyArray<ProblemaEstructuraPdf>,
  ): string {
    const partes = problemas.map((p) => {
      switch (p.tipo) {
        case 'AnclaFaltante':
          return `No se encontró el encabezado esperado "${p.ancla}".`;
        case 'PeriodoFaltante':
          return 'No se encontró el período (fecha desde/hasta) del estado de cuenta.';
        case 'PdfIlegible':
          return 'El PDF no se pudo releer para validar su estructura.';
        case 'MontoIleeible':
          // No se interpola el valor crudo: podría ser un monto real.
          return `Fila ${p.fila}, columna "${p.columna}": el monto no se pudo interpretar.`;
        case 'TokenSinAsignarSospechoso':
          return `Fila ${p.fila}: se encontró un valor con forma de monto fuera de las columnas configuradas.`;
      }
    });
    return `Estructura PDF inválida para ${banco}:\n  - ${partes.join('\n  - ')}`;
  }
}
