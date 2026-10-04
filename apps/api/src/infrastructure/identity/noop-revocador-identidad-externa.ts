import { IRevocadorIdentidadExterna } from '../../application/ports/revocador-identidad-externa.port';

/**
 * Implementación por defecto: no revoca nada y no loguea nada. T4 la
 * reemplaza por la revocación real de Sign in with Apple.
 */
export class NoopRevocadorIdentidadExterna implements IRevocadorIdentidadExterna {
  async revocar(_userId: string): Promise<void> {
    // intencionalmente vacío
  }
}
