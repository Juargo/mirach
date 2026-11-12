/**
 * - `cuenta-ya-existe`: la identidad de Apple o Google ya es dueña de otra
 *   cuenta (por `sub` o por email real verificado).
 * - `cuenta-no-anonima`: quien llama ya tiene credenciales.
 */
export type MotivoFalloVinculacion = 'cuenta-ya-existe' | 'cuenta-no-anonima';

const MENSAJES: Record<MotivoFalloVinculacion, string> = {
  'cuenta-ya-existe': 'Esa cuenta ya existe.',
  'cuenta-no-anonima': 'Esta cuenta ya está vinculada.',
};

/** Vincular una identidad a una cuenta anónima (ADR-013) no se pudo completar. */
export class VinculacionFallidaError extends Error {
  constructor(readonly motivo: MotivoFalloVinculacion) {
    super(MENSAJES[motivo]);
    this.name = 'VinculacionFallidaError';
  }
}
