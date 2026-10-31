import { z } from 'zod';

/** `MAJOR.MINOR.PATCH`, the format the API accepts for app versions. */
const appVersionExample = '1.10.0';

/**
 * Optional request headers the native apps send on EVERY request (#116). On
 * `GET /api/config` they decide `actualizacionRequerida`; on every route they
 * are logged once validated (ADR-011). Neither is ever required: an invalid or
 * missing value only makes `actualizacionRequerida` null.
 */
export const configHeadersSchema = z.object({
  'x-app-version': z.string().optional().meta({
    description:
      'Installed app version, MAJOR.MINOR.PATCH (compared numerically: 1.10.0 > 1.9.0).',
    example: appVersionExample,
  }),
  'x-app-platform': z.string().optional().meta({
    description:
      'Platform of the calling app: ios or android, case-insensitive. Any other value is ignored.',
    example: 'ios',
  }),
});

/**
 * Response contract for `GET /api/config` (ADR-005 §4.5). Values come from the
 * API configuration (env), so they change without shipping a new app (PLA-08).
 */
export const configResponseSchema = z
  .object({
    versionMinima: z
      .object({
        ios: z.string().meta({
          description: 'Minimum supported iOS app version (MAJOR.MINOR.PATCH).',
          example: appVersionExample,
        }),
        android: z.string().meta({
          description:
            'Minimum supported Android app version (MAJOR.MINOR.PATCH).',
          example: appVersionExample,
        }),
      })
      .describe('Minimum supported app version per platform.'),
    planGratis: z
      .object({
        bancosMaximos: z
          .number()
          .int()
          .describe('Maximum number of banks on the free plan (PLA-01).'),
        soloMesActual: z
          .boolean()
          .describe(
            'true when the free plan only covers the current month (PLA-01).',
          ),
      })
      .describe('Free plan limits.'),
    flags: z
      .record(z.string(), z.boolean())
      .describe(
        'Feature flags turned on, as { name: true }. A flag missing from the object is off.',
      ),
    actualizacionRequerida: z
      .boolean()
      .nullable()
      .describe(
        'true when X-App-Version is lower than the minimum for X-App-Platform: the app must ask the user to update. ' +
          'false when it is equal or higher. null when either header is missing or invalid.',
      ),
  })
  .meta({
    id: 'ConfigResponse',
    description:
      'GET /api/config — remote app configuration: minimum version per platform, free plan limits and flags (ADR-005 §4.5).',
  });
