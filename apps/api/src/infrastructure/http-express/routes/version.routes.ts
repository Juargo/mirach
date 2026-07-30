import type { Express } from 'express';
import { buildInfo } from '../build-info';

/**
 * registrarVersion — endpoint público `GET /version` (ADR-030).
 *
 * Vive en la raíz de la app, FUERA de `/api`, así que queda antes del
 * `apiKeyMiddleware` — igual que el health `GET /`. Curl-able sin API key para
 * saber rápido qué build está arriba. Mismo contrato que los `/version.json` de
 * web y landing: `{ version, commit, ref, builtAt }`.
 */
export function registrarVersion(app: Express): void {
  app.get('/version', (_req, res) => {
    res.status(200).json(buildInfo);
  });
}
