import { z } from 'zod';

/**
 * patronEnCategoriaCreateSchema — un patrón anidado dentro del body de
 * `POST /api/categorias` (CAT038-10/11, design.md D-04). TRANSPORT SHAPE
 * ONLY, same layer-honesty gate as `categoriaCreateRequestSchema`: no
 * length check on `patron`, no `matchType` enum membership, no REGEX
 * compile check — esas son reglas de dominio (`validarPatron`). `prioridad`
 * NUNCA es caller-supplied acá (`.strict()` la rechaza como campo
 * desconocido) — el server siempre la defaultea a 100 (D-04, "prioridad NOT
 * accepted").
 */
export const patronEnCategoriaCreateSchema = z
  .object({
    patron: z.string(),
    matchType: z.string(),
  })
  .strict();

/**
 * Transport-shape contracts for `/api/categorias` (US-038, design.md
 * §5.2/§7.2). LAYER-HONESTY GATE (buckets.schema.ts precedent): `bucket`
 * membership is a DOMAIN rule (`BucketNoAsignableError`) and MUST NOT be
 * duplicated here — `bucket` stays `z.string()`. Same for `nombre`
 * length — that lives in the use case (`NombreCategoriaInvalidoError`).
 *
 * `patrones` es OPCIONAL (CAT038-10) — ausente o `[]` se comporta idéntico
 * al contrato pre-existente (compat con mobile, ADR-038). `.max(20)` es un
 * guard de TAMAÑO de request (⇒ `BODY_INVALIDO` genérico), no una regla de
 * negocio — un nested insert sin cota es un DoS barato (design.md D-04).
 */
export const categoriaCreateRequestSchema = z
  .object({
    nombre: z.string(),
    bucket: z.string(),
    patrones: z.array(patronEnCategoriaCreateSchema).max(20).optional(),
  })
  .strict();

/**
 * PATCH body — partial, at least one field present (Q4). The presence
 * constraint is transport shape, so it lives here (not a 14th domain
 * error) and produces the generic `400 BODY_INVALIDO`.
 */
export const categoriaUpdateRequestSchema = z
  .object({
    nombre: z.string().optional(),
    bucket: z.string().optional(),
  })
  .strict()
  .refine((body) => body.nombre !== undefined || body.bucket !== undefined, {
    message: 'At least one of nombre or bucket must be present.',
  });

export const categoriaIdPathParamsSchema = z.object({
  id: z.string(),
});

const patronResponseInCategoriaSchema = z.object({
  id: z.string(),
  categoriaId: z.string(),
  patron: z.string(),
  matchType: z.string(),
  prioridad: z.number(),
});

/**
 * Response contract for a single categoría (mirrors `CategoriaDto`,
 * `infrastructure/http/dto/categoria.dto.ts`) — reused by the GET list
 * entries, the `POST` 201 and the `PATCH` 200. `aCategoriaDto()` is the
 * sync guarantee this schema is checked against (`categorias.schema.spec.ts`).
 */
export const categoriaResponseSchema = z
  .object({
    id: z.string(),
    nombre: z.string(),
    bucket: z.string(),
    patrones: z.array(patronResponseInCategoriaSchema),
    // z.number(), NOT .int().nonnegative(): layer-honesty gate (see file
    // docblock) — domain rules do not get duplicated into transport
    // schemas, and sibling `prioridad` (also an Int column) is a plain
    // z.number() too (design.md §5.3).
    transaccionesCount: z.number(),
  })
  .meta({
    id: 'CategoriaResponse',
    description:
      'A category with its nested classification patterns and the all-history count of the ' +
      "caller's own referencing transactions (US-038, US-039 CAT039-01).",
  });

/**
 * Response contract for `GET /api/categorias` — envelope `{ categorias }`,
 * mirrors `IngestasResponse` (`{ ingestas }`).
 */
export const catalogoResponseSchema = z
  .object({
    categorias: z.array(categoriaResponseSchema),
  })
  .meta({
    id: 'CatalogoResponse',
    description:
      "GET /api/categorias — the authenticated caller's full catalog (US-038, CAT038-02).",
  });
