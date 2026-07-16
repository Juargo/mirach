/**
 * Tipos de problemas que se reportan al validar la estructura de un PDF.
 *
 *   AnclaFaltante   → no se encontró un encabezado esperado en ningún token del PDF.
 *   PeriodoFaltante → no se encontró el período (fecha desde/hasta), reportado
 *                     AQUÍ solo cuando aparece junto a otros problemas de
 *                     encabezado en la misma pasada (si es el ÚNICO problema,
 *                     se reporta como `RangoFechasInvalidoError` — ver
 *                     PdfjsStructureValidatorService).
 *   PdfIlegible     → el PDF no se pudo releer en esta etapa (poco común: ya
 *                     pasó por detección — Track A — sin este problema).
 */
export type ProblemaEstructuraPdf =
  | { tipo: 'AnclaFaltante'; ancla: string }
  | { tipo: 'PeriodoFaltante' }
  | { tipo: 'PdfIlegible' };

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
      }
    });
    return `Estructura PDF inválida para ${banco}:\n  - ${partes.join('\n  - ')}`;
  }
}
