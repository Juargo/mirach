import { IRevocadorIdentidadExterna } from '../../application/ports/revocador-identidad-externa.port';

/**
 * Implementación por defecto cuando el cliente de Apple REST no está
 * configurado: no revoca nada y no loguea nada. Con credenciales, el
 * composition root cablea `AppleRevocadorIdentidadExterna` en su lugar.
 */
export class NoopRevocadorIdentidadExterna implements IRevocadorIdentidadExterna {
  async revocar(_userId: string): Promise<void> {
    // intencionalmente vacío
  }
}
