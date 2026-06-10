import { TipoColumna } from './tipo-columna';

/**
 * Describe una columna requerida en el archivo de movimientos.
 *
 *   letra  → letra de columna en la hoja (A, B, C, ...)
 *   nombre → texto exacto que debe aparecer en el encabezado
 *   tipo   → tipo de dato esperado para los valores de la columna
 */
export interface ColumnaEsperada {
  readonly letra: string;
  readonly nombre: string;
  readonly tipo: TipoColumna;
}
