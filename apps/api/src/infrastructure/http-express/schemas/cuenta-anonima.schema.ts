import { z } from 'zod';

import { authAppleTokenRequestSchema } from './auth-apple-token.schema';
import { versionesAceptadasSchema } from './consentimientos.schema';

export const TERMINOS_NO_ACEPTADOS = 'TERMINOS_NO_ACEPTADOS';
export const IDENTIDAD_INVALIDA = 'IDENTIDAD_INVALIDA';
export const CUENTA_YA_EXISTE = 'CUENTA_YA_EXISTE';
export const CUENTA_NO_ANONIMA = 'CUENTA_NO_ANONIMA';

const ID_TOKEN_MAX = 8192;

/** `POST /api/auth/anonimo` (ADR-013). */
export const authAnonimoRequestSchema = z.object({
  ...versionesAceptadasSchema,
});

export const terminosNoAceptadosResponseSchema = z
  .object({
    message: z.string(),
    code: z.literal(TERMINOS_NO_ACEPTADOS),
  })
  .meta({
    id: 'TerminosNoAceptadosResponse',
    description:
      '400 body of the anonymous sign-up when the accepted versions are missing while required, incomplete or malformed.',
  });

/** `POST /api/cuenta/vincular/apple`: the Apple token body without the terms versions. */
export const cuentaVincularAppleRequestSchema =
  authAppleTokenRequestSchema.omit({
    versionTerminos: true,
    versionPrivacidad: true,
  });

/** `POST /api/cuenta/vincular/google`. */
export const cuentaVincularGoogleRequestSchema = z.object({
  idToken: z
    .string()
    .min(1)
    .max(ID_TOKEN_MAX)
    .describe('Google ID token (JWT) from the native sign-in.'),
});

export const vinculacionRechazadaResponseSchema = z
  .object({
    message: z.string(),
    code: z
      .enum([CUENTA_YA_EXISTE, CUENTA_NO_ANONIMA])
      .describe(
        'CUENTA_YA_EXISTE: the Apple or Google identity already owns another account; nothing was ' +
          'written and the anonymous data is untouched (offer to sign in to that account). ' +
          'CUENTA_NO_ANONIMA: the caller already has a sign-in method.',
      ),
  })
  .meta({
    id: 'VinculacionRechazadaResponse',
    description: '409 body of the account-linking endpoints.',
  });

export const identidadInvalidaResponseSchema = z
  .object({
    message: z.string(),
    code: z
      .enum(['BODY_INVALIDO', IDENTIDAD_INVALIDA])
      .describe(
        'BODY_INVALIDO: the request body is malformed or incomplete. IDENTIDAD_INVALIDA: the Apple or ' +
          'Google token did not verify. Deliberately not a 401: the session itself is still valid.',
      ),
  })
  .meta({
    id: 'IdentidadInvalidaResponse',
    description: '400 body of the account-linking endpoints.',
  });
