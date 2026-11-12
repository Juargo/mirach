export type MotivoFalloAltaAnonima = 'terminos-no-aceptados';

/** El alta de una cuenta anónima (ADR-013) no se pudo completar. */
export class AltaAnonimaFallidaError extends Error {
  constructor(readonly motivo: MotivoFalloAltaAnonima) {
    super('No pudimos crear la cuenta.');
    this.name = 'AltaAnonimaFallidaError';
  }
}
