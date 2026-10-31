import { z } from 'zod';

const VERSION_DESCRIPCION =
  '1 to 32 letters, digits, dots, hyphens or underscores.';

/**
 * Optional fields of the Apple and Google token endpoints (AUTH-03, ADR-006 §4).
 * Their format is checked by the domain and only at signup, so a value here can
 * never affect the login of an existing user.
 */
export const versionesAceptadasSchema = {
  versionTerminos: z
    .string()
    .nullish()
    .describe(
      `Version of the terms the person accepted before signing in. Stored with the new account, in the same transaction, together with \`versionPrivacidad\`; send both or neither. Ignored for an existing account. ${VERSION_DESCRIPCION} When CONSENTS_REQUIRED is on, a new account without it is rejected with the generic 401.`,
    ),
  versionPrivacidad: z
    .string()
    .nullish()
    .describe(
      'Version of the privacy policy the person accepted before signing in; see `versionTerminos`.',
    ),
};
