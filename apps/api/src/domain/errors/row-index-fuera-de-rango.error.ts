/**
 * Causa cerrada del error (variante). Ambas variantes producen un mensaje
 * FIJO seleccionado en compile-time — NO hay texto libre inyectable (ADR-013,
 * D-03/D-04). El único texto interpolado son `rowIndex`/`totalFilas`, que son
 * enteros de posición, nunca montos ni datos sensibles del archivo.
 *
 *   'fuera-de-rango' → el `rowIndex` está fuera de `[0, totalFilas)`.
 *   'duplicado'      → hay un `rowIndex` repetido en el overlay (intent ambiguo).
 */
export type CausaRowIndexInvalido = 'fuera-de-rango' | 'duplicado';

/**
 * RowIndexFueraDeRangoError — error de dominio.
 *
 * Se produce cuando una edición del overlay de commit referencia un `rowIndex`
 * fuera del rango válido `[0, totalFilas)` del set re-parseado, o cuando hay
 * un `rowIndex` duplicado en el overlay (intent ambiguo).
 *
 * Un índice fuera de rango indica que el archivo que se está confirmando (commit)
 * NO es el mismo que se previsualizó — el re-parseo produjo un conteo distinto.
 * La respuesta conservadora es rechazar todo el commit (fail-closed, D-04).
 *
 * El mensaje es FIJO por variante (`causa`): NO se acepta texto libre del caller,
 * de modo que ningún dato sensible (p. ej. un monto pegado en el request) puede
 * alcanzar `.message` (ADR-013). Los dos mensajes son constantes de compilación.
 */
export class RowIndexFueraDeRangoError extends Error {
  constructor(
    public readonly rowIndex: number,
    public readonly totalFilas: number,
    public readonly causa: CausaRowIndexInvalido = 'fuera-de-rango',
  ) {
    super(RowIndexFueraDeRangoError.formatear(rowIndex, totalFilas, causa));
    this.name = 'RowIndexFueraDeRangoError';
  }

  private static formatear(
    rowIndex: number,
    totalFilas: number,
    causa: CausaRowIndexInvalido,
  ): string {
    switch (causa) {
      case 'duplicado':
        return (
          `una edición referencia una fila (rowIndex ${rowIndex}) más de una ` +
          `vez en el overlay; cada fila puede editarse a lo sumo una vez`
        );
      case 'fuera-de-rango':
        return (
          `una edición referencia una fila que no existe en el archivo ` +
          `(rowIndex ${rowIndex} fuera del rango [0, ${totalFilas}); ` +
          `el archivo pudo haber cambiado)`
        );
    }
  }
}
