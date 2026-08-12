import { z } from 'zod';

/**
 * catalogoErrorResponseSchema — shared non-2xx body for the 4 new catalog
 * endpoints (`/api/categorias`, `/api/patrones`), US-038, design.md Q2/§7.3.
 *
 * `code` is machine-readable and ADDITIVE: the ~13 pre-existing operations
 * keep their description-only `{ message }` error responses — this schema
 * is not retrofitted onto them (design.md Q2 boundary). Consumers MUST
 * treat `code` as optional going forward, but on these 4 paths it is always
 * present, one class ⇒ one status ⇒ one code (`aCatalogoHttpError`).
 */
export const catalogoErrorResponseSchema = z
  .object({
    message: z.string(),
    code: z.string(),
  })
  .meta({
    id: 'CatalogoErrorResponse',
    description:
      'Error body for the 4 new catalog endpoints (US-038). Not retrofitted onto pre-existing operations.',
  });
