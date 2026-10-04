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
    // CAT038-11: only present on a PatronEnLoteInvalidoError — the
    // zero-based position of the offending entry within the submitted
    // `patrones[]` array of POST /api/categorias. Optional: every other
    // error on these 4 endpoints omits it.
    indice: z.number().optional(),
  })
  .meta({
    id: 'CatalogoErrorResponse',
    description:
      'Error body for the 4 new catalog endpoints (US-038). Not retrofitted onto pre-existing operations. ' +
      '`indice` is present only for a nested-patrón validation failure on POST /api/categorias (CAT038-11).',
  });

/**
 * 403 body of `PATCH`/`DELETE /api/categorias/{id}` on a system category
 * (`Categoria.esInterna`, #778). One class ⇒ one status ⇒ one code, so `code`
 * is a literal here instead of the open string of `CatalogoErrorResponse`.
 */
export const categoriaInternaErrorResponseSchema = z
  .object({
    message: z.string(),
    code: z.literal('CATEGORIA_INTERNA'),
  })
  .meta({
    id: 'CategoriaInternaErrorResponse',
    description:
      '403 body: the category is a system category (`esInterna: true`, the per-bucket ' +
      '"Desconocido") and cannot be renamed, re-bucketed or deleted.',
  });
