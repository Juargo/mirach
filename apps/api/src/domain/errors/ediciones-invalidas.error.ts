/**
 * EdicionesInvalidasError — error de dominio.
 *
 * Se produce cuando el campo `edits` del request de commit tiene un formato
 * inválido: JSON malformado, no es un arreglo, un elemento falta `rowIndex`
 * o `categoriaId`, o sus tipos no son correctos.
 *
 * El mensaje es FIJO y descriptivo — NUNCA interpola el valor crudo del campo
 * (podría contener datos sensibles como montos, según ADR-013). Solo describe
 * qué está mal en términos de estructura.
 *
 * Sigue el precedente de `ExtensionNoPermitidaError` (error de forma/validación
 * en el boundary de entrada, no de estado de negocio).
 */
export class EdicionesInvalidasError extends Error {
  constructor(public readonly motivo: string) {
    super(`Ediciones inválidas en el campo edits: ${motivo}`);
    this.name = 'EdicionesInvalidasError';
  }
}
