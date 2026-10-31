import { Result } from '../../shared/result';
import { PlataformaAppInvalidaError } from '../errors/plataforma-app-invalida.error';

/**
 * PlataformaApp — plataformas nativas soportadas (ADR-007): cada una tiene su
 * propia versión mínima (ADR-005 §4.5).
 */
export const PLATAFORMAS_APP = ['ios', 'android'] as const;

export type PlataformaApp = (typeof PLATAFORMAS_APP)[number];

/** Parsea una plataforma sin distinguir mayúsculas (`iOS` → `ios`). */
export function parsearPlataformaApp(
  raw: string,
): Result<PlataformaApp, PlataformaAppInvalidaError> {
  const normalizada = raw.toLowerCase();
  const plataforma = PLATAFORMAS_APP.find((p) => p === normalizada);
  if (plataforma === undefined) {
    return Result.fail(new PlataformaAppInvalidaError());
  }
  return Result.ok(plataforma);
}
