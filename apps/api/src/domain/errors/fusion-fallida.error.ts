/**
 * - `origen-invalido`: el token de origen no existe o venció, su cuenta no es
 *   anónima o es la del propio destino (ADR-014). Un solo motivo para todas
 *   las causas.
 * - `destino-anonimo`: quien llama es una cuenta anónima, que no puede
 *   recibir una fusión.
 */
export type MotivoFalloFusion = 'origen-invalido' | 'destino-anonimo';

const MENSAJES: Record<MotivoFalloFusion, string> = {
  'origen-invalido': 'Esos datos ya no están disponibles.',
  'destino-anonimo': 'Primero vincula tu cuenta para unir datos.',
};

/** Fusionar una cuenta anónima con otra (ADR-014) no se pudo completar. */
export class FusionFallidaError extends Error {
  constructor(readonly motivo: MotivoFalloFusion) {
    super(MENSAJES[motivo]);
    this.name = 'FusionFallidaError';
  }
}
