import type { Router } from 'express';
import type { Container } from '../../../composition/container';
import type { authCapabilitiesResponseSchema } from '../schemas/auth-capabilities.schema';
import type { z } from 'zod';

type AuthCapabilitiesResponse = z.infer<typeof authCapabilitiesResponseSchema>;

/**
 * registrarAuthCapabilities — `GET /api/auth/capabilities` (AC-10, design
 * §8/D7). Session-public + api-key required (mounted on the same
 * `authPublicApi` router as `login`/`demo`), and — unlike the Google routes
 * themselves — ALWAYS mounted regardless of activation state: its entire
 * purpose is to let a client discover that state before rendering any
 * Google-login affordance.
 *
 * Reads `container.googleAuth`/`container.googleAuthMobile` directly — no
 * separate boolean flag exists anywhere in the codebase (design §4.3's whole
 * point, extended by §8 to the mobile gate). Takes an object of the two
 * graph fields, not the full `Container` and not two positional nullable
 * params (a positional pair would be trivially swappable by mistake) — ISP,
 * same discipline as the rest of `routes/`.
 */
export function registrarAuthCapabilities(
  router: Router,
  {
    googleAuth,
    googleAuthMobile,
  }: {
    googleAuth: Container['googleAuth'];
    googleAuthMobile: Container['googleAuthMobile'];
  },
): void {
  router.get('/auth/capabilities', (_req, res) => {
    const body: AuthCapabilitiesResponse = {
      googleLoginEnabled: googleAuth !== undefined,
      googleLoginMobileEnabled: googleAuthMobile !== undefined,
    };
    res.status(200).json(body);
  });
}
