import type { Router } from 'express';
import type { z } from 'zod';
import type { ObtenerConfiguracionAppUseCase } from '../../../application/use-cases/obtener-configuracion-app.use-case';
import type { configResponseSchema } from '../schemas/config.schema';

type ConfigResponse = z.infer<typeof configResponseSchema>;

/**
 * registrarConfig — `GET /api/config` (ADR-005 §4.5, #116). Session-public +
 * api-key required: mounted on `authPublicApi`, so any installed version can
 * read it before signing in. The raw headers go to the use case, which
 * validates them; an invalid value never turns into an error response.
 */
export function registrarConfig(
  router: Router,
  obtenerConfiguracionApp: ObtenerConfiguracionAppUseCase,
): void {
  router.get('/config', (req, res) => {
    const body: ConfigResponse = obtenerConfiguracionApp.execute({
      plataforma: req.get('x-app-platform'),
      version: req.get('x-app-version'),
    });
    res.status(200).json(body);
  });
}
