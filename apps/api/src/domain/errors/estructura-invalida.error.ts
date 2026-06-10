/**
 * Tipos de problemas que se reportan al validar la estructura del archivo.
 *
 *   ColumnaFaltante   → no se encontró el encabezado esperado en la celda indicada.
 *   TipoIncorrecto    → el valor de una fila de datos no coincide con el tipo esperado.
 *   SinEncabezados    → la fila de encabezados está completamente vacía.
 */
export type ProblemaEstructura =
  | { tipo: 'ColumnaFaltante'; columna: string; esperado: string; encontrado: string }
  | {
      tipo: 'TipoIncorrecto';
      columna: string;
      fila: number;
      tipoEsperado: string;
      valor: string;
    }
  | { tipo: 'SinEncabezados'; fila: number };

/**
 * Error de dominio: el archivo no cumple la estructura esperada para el banco.
 *
 * Agrupa todos los problemas detectados en una sola pasada (US-002 nota UX:
 * mostrar todos los errores juntos, no uno a la vez).
 */
export class EstructuraInvalidaError extends Error {
  constructor(
    public readonly banco: string,
    public readonly problemas: ReadonlyArray<ProblemaEstructura>,
  ) {
    super(EstructuraInvalidaError.formatear(banco, problemas));
    this.name = 'EstructuraInvalidaError';
  }

  private static formatear(
    banco: string,
    problemas: ReadonlyArray<ProblemaEstructura>,
  ): string {
    const partes = problemas.map((p) => {
      switch (p.tipo) {
        case 'ColumnaFaltante':
          return `Falta la columna "${p.esperado}" en ${p.columna} (encontrado: "${p.encontrado}").`;
        case 'TipoIncorrecto':
          return `Fila ${p.fila}, columna "${p.columna}": se esperaba ${p.tipoEsperado} y se encontró "${p.valor}".`;
        case 'SinEncabezados':
          return `La fila de encabezados (${p.fila}) está vacía.`;
      }
    });
    return `Estructura inválida para ${banco}:\n  - ${partes.join('\n  - ')}`;
  }
}
