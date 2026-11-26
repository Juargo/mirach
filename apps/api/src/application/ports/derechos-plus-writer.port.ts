import type { CambioDerechosPlus } from '../../domain/value-objects/cambio-derechos-plus';

/** Un cambio que sí toca derechos guardados. */
export type CambioDerechosAplicable = Exclude<
  CambioDerechosPlus,
  { tipo: 'ignorado' }
>;

/**
 * Qué pasó con el cambio:
 * - `aplicado`: los derechos quedaron actualizados.
 * - `duplicado`: ese evento ya se había procesado; no se tocó nada.
 * - `obsoleto`: llegó después de un evento más reciente de la misma
 *   suscripción; no se tocó nada.
 * - `usuario_desconocido`: ninguno de los usuarios del evento existe.
 */
export type ResultadoCambioDerechos =
  'aplicado' | 'duplicado' | 'obsoleto' | 'usuario_desconocido';

/**
 * IDerechosPlusWriter — aplica el cambio de un evento de la tienda, una sola
 * vez por `eventoId` (ADR-012 §1). El registro del evento y el cambio se
 * escriben en la misma transacción.
 */
export interface IDerechosPlusWriter {
  aplicar(
    eventoId: string,
    cambio: CambioDerechosAplicable,
  ): Promise<ResultadoCambioDerechos>;
}
