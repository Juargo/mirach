# Classification template coverage (step 2)

Objective: raise the template's coverage, measured against the user's real BCI statement, with three new categories and CONTAINS patterns. Branch `feat/api-plantilla-clasificacion`. Delivery: one PR, plus a supervised per-user backfill after merge. Test runner: `npx vitest run` in `apps/api`.

## Specs

- **S1 — Measure.** Measure the template against the user's real statements, "locally only, never committed".
  - Baseline on `Bci Personas.pdf`: 101 movements. 12 are income, 34 are classified correctly, and 55 of the 89 expenses fall to «Desconocido».
- **S2 — New categories.** User decision (L2): "agrega las tres categorías nuevas".
  - **Suscripciones** (Gustos/Deseos), **Seguros** (Necesidades), **Comisiones bancarias** (Necesidades).
  - Icons from the existing allowlist: `smartphone`, `shield`, `credit-card`. The allowlist and the clients do not change.
- **S3 — New CONTAINS patterns, without tildes, based on the measured glosas:**
  - Transporte (Gustos/Deseos), a new category with icon `car`: `cabify`, `uber`. `uber eats` stays Delivery because it is longer. L7: "Uber también en transporte de gustos".
  - Previously: `cabify` in Transporte (Gustos/Deseos). L6: "Cabify dejalo en transporde gustos. La persona debe hacer la modificación explicitamente para que quede en transporte necesidades."
  - Deuda: `pago credito`, `hipotec`, `pac tarjeta de credito`.
  - Ahorro: `alcancia`.
  - Seguros: `seguro`, `metlife`.
  - Comisiones bancarias: `comision`. `sobregiro` is longer, so overdraft commissions stay Deuda.
  - Suscripciones: `apple.com`, `google play`, `patreon`, `anthropic`, `openai`.
  - Streaming: `youtube`.
  - *Assumption:* glosas that do not name the merchant stay «Desconocido»: «COMPRA TARJETA DEBITO», transfers to third parties, and MercadoPago without a merchant.
- **S4 — Legacy pattern types (step 1 L5):**
  - `afp ` STARTS_WITH becomes `afp` CONTAINS.
  - `^transf(?:erencia)?.*ahorro` REGEX becomes `ahorro` CONTAINS.
  - *Assumption:* `\bwom\b` stays REGEX. A CONTAINS `wom` would classify Women'secret (a clothing store in Chilean malls) as telefonía.
  - Existing glosa pins must keep their category.
- **S5 — Existing users.** New users get the template on signup. Existing users need `prisma/backfill-catalogo-faltante.ts --user <id>`, run supervised against production after the deploy. It also re-adds template patterns the user deleted, so each run needs the user's go-ahead.

## Tasks

- [x] T1 — S2-S4 — inline — commit: the feature commit. RED: 15 new glosa pins failed. GREEN: unit 3458/3458, integration 265/265, e2e 145/145.
- [x] T4 — S3 (L6) — inline — Cabify → Transporte in Deseos. RED: the Cabify pin failed. Unit 3458/3458, integration 265/265, e2e 145/145.
- [x] T5 — S3 (L7) — inline — Uber → Transporte in Deseos. RED: the Uber pin failed.
- [x] T2 — S1 — inline — re-measured: «Desconocido» down from 55 to 16 of 89 expenses (L4).
- [x] T3 — S5 — inline — production backfill through the Supabase connector (L8). All 7 accounts have 20 categories and 56 patterns.

## Log

- L1 (2026-11-06): "sí, paso 2" (step 2: measure the template against the real statements and replace REGEX and STARTS_WITH entries).
- L2 (2026-11-06): after the measurement and the question about categories: "agrega las tres categorías nuevas".
- L3: The measurement script lives in the scratchpad and reads `~/Downloads/Bci Personas.pdf`. No real glosa goes into the repo; the test glosas are generic merchant names.
- L4: Re-measure on `Bci Personas.pdf` after T1:
  - 73 expenses matched, all to the right category, against 34 before.
  - 16 stay «Desconocido». None names a merchant the template could know: debit card purchases without a merchant, transfers to third parties, MercadoPago without a merchant, and unknown local shops.
- L5: Template sizes: 19 categories (was 16) and 54 patterns (was 39). Seed ids were added for every new category and pattern. The ids of `afp` and `ahorro` keep their historical values (`pat-afp`, `pat-transferencia-ahorro`).
- L6 (2026-11-06): "Cabify dejalo en transporde gustos. La persona debe hacer la modificación explicitamente para que quede en transporte necesidades."
  - Added Transporte in Deseos, a homonym that ADR-042 allows. The template is now 20 categories.
  - Two icon tests looked icons up by name only, so they were keyed by bucket and name.
  - The T4.8a integration test used to create that homonym by hand. It now uses the seeded row.
- L7 (2026-11-06): "Uber también en transporte de gustos".
- L8 (2026-11-06): "puedes hacerlo tu", then "ok" after re-adding the execute_sql allow rule.
  - Dry run (read only): 7 accounts, each with its 39 original patterns intact, so no deleted pattern was revived. Each one was missing the same 4 categories and 17 patterns.
  - One transaction inserted only the missing rows. Existing rows were not changed.
  - Check: each new pattern points to the expected category and bucket in all 7 accounts. The old `afp ` STARTS_WITH and `transf…ahorro` REGEX rows remain next to the new `afp` and `ahorro`.
  - Imported movements are not reclassified until a reevaluation runs. Reevaluation skips manual classifications (CLA-16).
