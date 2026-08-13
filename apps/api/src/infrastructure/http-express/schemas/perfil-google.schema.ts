import { z } from 'zod';

/**
 * Transport-shape contracts for `/api/perfil/google/*` (US-041, design.md
 * §5.4). Covers both the LINK leg (PR #2) and the UNLINK leg (PR #3).
 *
 * LAYER-HONESTY GATE (`perfil.schema.ts` / `categorias.schema.ts`
 * precedent): no `.min()` on `passwordActual` — the current password is
 * *verified*, not *validated*; a length rule here would be a business claim
 * in the transport layer and would leak the password policy to an
 * unauthenticated shape check. No `.url()` on `urlAutorizacion` either: it
 * is server-generated (`openid-client`, against the discovered issuer) and a
 * format assertion on our own output is theatre.
 */
export const vincularGoogleRequestSchema = z
  .object({ passwordActual: z.string() })
  .strict(); // VINC041-08: un userId extra ⇒ 400, nunca ignorado en silencio.

export const vincularGoogleResponseSchema = z
  .object({ urlAutorizacion: z.string() })
  .meta({
    id: 'VincularGoogleResponse',
    description:
      'POST /api/perfil/google/vincular — the Google OAuth authorization URL to navigate to (VINC041-01).',
  });

/**
 * `POST /api/perfil/google/desvincular` (VINC041-05). Same layer-honesty
 * gate as `vincularGoogleRequestSchema`: no `.min()` on `passwordActual` —
 * it is verified, not validated. `.strict()` for the same reason
 * (VINC041-08): a `userId` extra field cannot ride along.
 */
export const desvincularGoogleRequestSchema = z
  .object({ passwordActual: z.string() })
  .strict();

/**
 * `dry` rule-of-three, RECORDED not silently deferred (design.md §5.4,
 * task 2.11 guard note): `perfilErrorResponseSchema` (`perfil.schema.ts`) is
 * REUSED verbatim for this endpoint's error bodies rather than a third
 * `{message, code}` shape being minted here. This is the third occurrence
 * of that shape overall (after `catalogoErrorResponseSchema` and
 * `perfilErrorResponseSchema` itself) — explicitly RE-DEFERRING the
 * extraction of a shared `ErrorResponse` schema for this PR: the
 * `/api/perfil*` family already has one shared schema
 * (`perfilErrorResponseSchema`) reused across FOUR endpoints as of this
 * change (update, password, vincular, and — PR #3 — desvincular), which is
 * exactly the DRY payoff a cross-family `ErrorResponse` extraction would
 * buy, without inventing a new cross-cutting type this PR does not need
 * (`yagni`). Revisit if a family OTHER than `/api/perfil*` needs the same
 * `{message, code}` shape.
 */
