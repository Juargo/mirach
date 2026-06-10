/**
 * Tipos de datos esperados para columnas de movimientos bancarios.
 *
 * Usado por la validación de estructura (US-002) para verificar que cada
 * columna requerida contiene valores del tipo correcto.
 */
export enum TipoColumna {
  Fecha = 'Fecha',
  Numero = 'Numero',
  Texto = 'Texto',
}
