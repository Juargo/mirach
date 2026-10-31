import { z } from 'zod';

import { TIPOS_CONSENTIMIENTO } from '../../../domain/value-objects/consentimiento';

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

const tipoConsentimientoSchema = z.enum(TIPOS_CONSENTIMIENTO as [string]);

/** `DELETE /api/consentimientos/:tipo` path parameter. */
export const consentimientoParamsSchema = z.object({
  tipo: tipoConsentimientoSchema.describe('What is being revoked.'),
});

/** `POST /api/consentimientos`; `.strict()`: the user only comes from the session. */
export const consentimientoRequestSchema = z
  .object({
    tipo: tipoConsentimientoSchema.describe('What the person accepted.'),
    version: z
      .string()
      .describe(`Version of the accepted document. ${VERSION_DESCRIPCION}`),
  })
  .strict();

export const consentimientoResponseSchema = z.object({
  tipo: tipoConsentimientoSchema,
  version: z.string(),
  aceptadoEn: z.string().describe('ISO-8601 UTC timestamp.'),
  revocadoEn: z
    .string()
    .nullable()
    .describe('ISO-8601 UTC timestamp; null while the consent is in force.'),
});

export const consentimientosResponseSchema = z.object({
  consentimientos: z
    .array(consentimientoResponseSchema)
    .describe(
      'Every consent of the session user, newest first. Revoked ones stay as history.',
    ),
});
