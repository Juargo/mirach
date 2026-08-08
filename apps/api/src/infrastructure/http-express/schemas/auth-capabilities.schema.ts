import { z } from 'zod';

/**
 * Response contract for `GET /api/auth/capabilities` (AC-10, design §4.5).
 *
 * Single boolean field. The client (web/mobile) reads this BEFORE deciding
 * whether to render the "Continuar con Google" affordance — this is the
 * seam that keeps the kill switch (unset GOOGLE_CLIENT_ID/SECRET in Render)
 * code-free: no build-time flag, no redeploy, just a fresh answer from this
 * endpoint on the next page load.
 */
export const authCapabilitiesResponseSchema = z
  .object({
    googleLoginEnabled: z
      .boolean()
      .describe(
        'true when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are both configured ' +
          '(container.googleAuth !== undefined), false otherwise (AUTH-16).',
      ),
  })
  .meta({
    id: 'AuthCapabilitiesResponse',
    description:
      'GET /api/auth/capabilities — feature-activation discovery for auth-related, environment-gated affordances (AC-10).',
  });
