import { z } from 'zod';

/**
 * Response contract for `GET /api/auth/capabilities` (AC-10, design §8/D7).
 *
 * Two independent boolean fields — one per client (web/mobile). Each client
 * reads its own flag BEFORE deciding whether to render its own
 * "Continuar con Google" affordance. `googleLoginEnabled` keeps its
 * original web-only meaning (additive, non-breaking); `googleLoginMobileEnabled`
 * is a second, independently computed flag that MUST equal whether
 * `POST /api/auth/google/token` is reachable (activation-consistency
 * invariant, AUTH-22/AC-10). Not `.strict()` — unknown keys are ignored, not
 * rejected (design §8, header correction 2), so this additive field is
 * provably non-breaking for the already-shipped web client.
 */
export const authCapabilitiesResponseSchema = z
  .object({
    googleLoginEnabled: z
      .boolean()
      .describe(
        'true when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are both configured ' +
          '(container.googleAuth !== undefined), false otherwise (AUTH-16).',
      ),
    googleLoginMobileEnabled: z
      .boolean()
      .describe(
        'true when GOOGLE_CLIENT_ID_ANDROID is configured ' +
          '(container.googleAuthMobile !== undefined), false otherwise (AUTH-22). ' +
          'Computed independently of googleLoginEnabled — either, both, or ' +
          'neither may be true.',
      ),
  })
  .meta({
    id: 'AuthCapabilitiesResponse',
    description:
      'GET /api/auth/capabilities — feature-activation discovery for auth-related, environment-gated affordances (AC-10). ' +
      'googleLoginEnabled gates the web Google-login affordance; googleLoginMobileEnabled gates the mobile one — independent env configurations.',
  });
