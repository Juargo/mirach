# Mobile Configuración Specification

## Purpose

`apps/mobile` gains a Configuración surface (Perfil + Categorías tabs) with
the SAME backend endpoints, error copy, and destructive-action warnings the
web app already ships (ADR-024: mobile is presentation-only, zero business
logic duplicated). Prefixes mirror web's `WCFG-*`/`WCTG-*` for
requirement-to-requirement parity traceability (CQ-6).

## Requirements

### Requirement: MCFG-01 — Entry point and navigation (CA-01)

A gear control in the dashboard `Header` MUST `router.push('/configuracion')`
(`accessibilityRole="button"`, Spanish label). `/configuracion` MUST render
segmented `Perfil | Categorías` tabs as local screen state, not routes.
Native Expo Router back MUST return to the dashboard. A category row MUST
`router.push('/categoria/[id]')`, whose back returns to Categorías.

#### Scenario: Gear opens Configuración

- GIVEN the dashboard is showing
- WHEN the user activates the gear
- THEN `/configuracion` opens with `Perfil` active and native back works

#### Scenario: Tab switch is not a route change

- GIVEN `/configuracion` is open
- WHEN the user taps `Categorías`
- THEN the URL/route is unchanged; only local tab state updates

### Requirement: MCFG-02 — Perfil fields and read-only Google status

The Perfil tab MUST render `Nombre`, `Email` (nullable), `Password actual`/
`Password nueva`, and a Google status block (`Vinculada: {email}` /
`Vinculada` / `No vinculada`) with NO action control (binding decision 1).

#### Scenario: A null email renders without crashing

- GIVEN `me.email` is `null`
- WHEN the Perfil tab renders
- THEN the `Email` field renders empty/placeholder, no crash

#### Scenario: Google block exposes no button

- GIVEN any `googleVinculado` value
- WHEN the block renders
- THEN only the status pill renders — no `Vincular`/`Desvincular` control

### Requirement: MCFG-03 — Save diffs the form and sequences the two calls (mirrors WCFG-05/06/07)

`Guardar cambios` MUST send `PATCH /api/perfil` only if `nombre`/`email`
changed, and `PATCH /api/perfil/password` only if `Password nueva` is
non-empty. WHEN both changed, the profile call MUST resolve first and its
failure MUST abort the password call. A password-only failure after a
successful profile save MUST leave `Nombre`/`Email` saved and re-render the
same screen so retry sends only the password call.

#### Scenario: Nombre-only save sends one request

- GIVEN only `Nombre` is dirty
- WHEN `Guardar cambios` is activated
- THEN only `PATCH /api/perfil` is sent, without `passwordActual`

#### Scenario: A profile failure aborts the password call

- GIVEN `Email` and `Password nueva` both changed
- WHEN `PATCH /api/perfil` fails
- THEN `PATCH /api/perfil/password` is never called

### Requirement: MCFG-04 — Perfil error/success copy is a closed table (mirrors WCFG-09)

Requires `ApiError` to carry the response `code` (CQ-3). Copy MUST be chosen
from a client-owned table keyed by `status + code`, never a server
`message`; wrong-password and taken-email `403 PERFIL_RECHAZADO` MUST render
byte-identical copy (anti-enumeration). A password change success MUST show
«Cambios guardados. Se cerraron tus otras sesiones.»; `tag: 'unauthorized'`
MUST route through the session gate, never a rendered message.

#### Scenario: Wrong password and taken email are indistinguishable

- GIVEN two `403 PERFIL_RECHAZADO` responses with different causes
- WHEN each is mapped to copy
- THEN both render the identical string, naming neither cause

### Requirement: MCTG-01 — Catálogo list grouped by bucket (mirrors WCTG-02/03)

The Categorías tab MUST list categories grouped in fixed order
`Necesidades → Gustos → Ahorro` (wire value `Deseos` displayed as `Gustos`),
each row showing a pattern-count tag (`sin patrones` / `1 patrón` /
`N patrones`) and a `Nueva categoría` entry point.

#### Scenario: Groups render in fixed order with the display label

- GIVEN categories across all three buckets
- WHEN the list renders
- THEN groups appear `Necesidades`, `Gustos`, `Ahorro`, in that order

#### Scenario: Pattern-count tag has three grammatical forms

- GIVEN categories with 0, 1, and 3 patterns
- WHEN their tags render
- THEN they read `sin patrones`, `1 patrón`, `3 patrones` respectively

### Requirement: MCTG-02 — Nueva categoría (CA-03)

`Nueva categoría` MUST open an inline form (`nombre`, `bucket` — both
required) and call `POST /api/categorias`; on success the list MUST refresh.

#### Scenario: Creating a category refreshes the list

- GIVEN valid `nombre`/`bucket`
- WHEN the form is submitted
- THEN `POST /api/categorias` is called and the list re-fetches

### Requirement: MCTG-03 — Editar categoría identity commit and bucket-change confirmation (mirrors WCTG-04/07)

`Nombre`/`Bucket` MUST commit ONLY on `Guardar`, via one
`PATCH /api/categorias/:id`. WHEN `Bucket` is dirty, `Guardar` MUST NOT send
the request until an `Alert.alert` impact confirmation (naming the money
move and "todos los períodos") is confirmed. `Cancelar` MUST discard ONLY
the identity draft — any pattern committed earlier in the visit MUST persist.

#### Scenario: A dirty bucket blocks save without confirmation

- GIVEN `Bucket` changed from `Necesidades` to `Deseos`
- WHEN `Guardar` is activated
- THEN no `PATCH` is sent until the impact `Alert.alert` is confirmed

#### Scenario: Cancelar preserves an already-committed pattern edit

- GIVEN a pattern was added (committed) then `Nombre` was edited
- WHEN `Cancelar` is activated
- THEN the identity edit is discarded and the added pattern remains on reopen

### Requirement: MCTG-04 — Pattern CRUD commits per row with an explicit confirm gesture (CQ-5)

Add/edit/delete of a pattern MUST commit immediately and independently of
`Guardar`, via its own `POST`/`PATCH`/`DELETE /api/patrones`. Add and edit
actions MUST require an explicit per-row confirm control (not blur/Enter,
which do not transfer to touch). Delete MUST have no confirmation. `prioridad`
MUST NEVER be sent. The note «Sin patrones: solo asignación manual.» MUST
always render below the section, regardless of pattern count.

#### Scenario: Adding a pattern requires an explicit confirm tap

- GIVEN a new pattern row's fields are filled
- WHEN the user has not tapped the row's confirm control
- THEN no `POST /api/patrones` is sent

#### Scenario: The zero-patterns note always renders

- GIVEN a category with 0 and, separately, 3 patterns
- WHEN the edit screen renders either
- THEN the identical note renders in both cases

### Requirement: MCTG-05 — Delete confirmation and always-204 (mirrors WCTG-08)

`Eliminar categoría` MUST open an `Alert.alert` whose body is sourced from
the already-loaded `transaccionesCount` (never refetched), softening but
never skipping the sentence at `0`. Confirming MUST call
`DELETE /api/categorias/:id` and treat the response as always successful
(`204`); no code path may branch on a `409`.

#### Scenario: Delete with transactions shows the impact sentence

- GIVEN `transaccionesCount: 12`
- WHEN the delete confirm opens
- THEN the body states 12 transactions move to Sin categoría, all periods

#### Scenario: Zero transactions still requires confirmation

- GIVEN `transaccionesCount: 0`
- WHEN the delete confirm opens
- THEN the sentence is softened but the confirm step is not skipped

### Requirement: MCTG-06 — Catálogo error copy closed table plus demo defensive mapping (mirrors WCTG-12, CQ-4)

Copy MUST be a `Record<CodigoCatalogo, string>` over the same 12 codes web
uses (verbatim strings), selected by `code` alone. `403 DEMO_SOLO_LECTURA`
MUST map defensively to the same copy row; no proactive disabled-controls
layer is built (mobile cannot hold a demo session today — YAGNI).

#### Scenario: An unmapped code fails to compile

- GIVEN a new `CodigoCatalogo` member with no table row
- WHEN the mapping is type-checked
- THEN `tsc` fails

#### Scenario: A defensive 403 still renders mapped copy

- GIVEN a mutation somehow receives `403 DEMO_SOLO_LECTURA`
- WHEN it is mapped
- THEN the closed table's demo row renders, not a generic fallback

### Requirement: MCTG-07 — Dashboard refresh after a bucket change

`solicitarRecargaResumen()` MUST be called only after a category mutation
that successfully changes a category's **bucket** (re-bucket). Create,
rename-only, delete, and all pattern mutations (add/edit/delete) MUST NOT
call it — none of them moves a transaction across buckets.

#### Scenario: A bucket change refreshes the dashboard

- GIVEN a category's bucket was changed and saved
- WHEN the mutation resolves
- THEN `solicitarRecargaResumen()` is called

#### Scenario: A pattern edit does not refresh the dashboard

- GIVEN a pattern was added
- WHEN the mutation resolves
- THEN `solicitarRecargaResumen()` is NOT called

#### Scenario: Creating a category does not refresh the dashboard

- GIVEN a new category was created and saved
- WHEN the mutation resolves
- THEN `solicitarRecargaResumen()` is NOT called (a new category has zero
  transactions attached, so nothing can move between buckets)

#### Scenario: A rename-only edit does not refresh the dashboard

- GIVEN a category's name was changed but its bucket was not
- WHEN the mutation resolves
- THEN `solicitarRecargaResumen()` is NOT called (a rename never touches
  `bucketId`)

#### Scenario: Deleting a category does not refresh the dashboard

- GIVEN a category was deleted
- WHEN the mutation resolves
- THEN `solicitarRecargaResumen()` is NOT called (delete leaves `bucketId`
  untouched — `eliminar-categoria.use-case.ts` — so no transaction moves
  between buckets)

### Requirement: MCFG-MCTG-08 — Domain purity and test coverage (CA-04, CA-05)

No file under `src/domain` MAY re-implement a backend rule (classification
tie-break, bucket validity, uniqueness, "moves to Sin categoría"); `bucket`/
`matchType` MUST be read as plain `string` and written via a closed literal
union. Every new screen/component MUST have jest-expo + RNTL tests; every
pure helper MUST have a plain unit test (ADR-017).

#### Scenario: A server-unknown bucket still lists

- GIVEN a category whose `bucket` value the client does not recognise
- WHEN the list renders
- THEN the row still renders (read path never rejects an unknown string)

### Requirement: MCTG-09 — NOMBRE_DUPLICADO copy is bucket-aware (ADR-042)

> Renumbered at archive time: the source change (`categoria-unica-por-bucket`) labeled this requirement
> `MCTG-07` in its delta spec, colliding with the pre-existing canonical `MCTG-07` ("Dashboard refresh
> after a bucket change", a different requirement from an earlier change). `sdd-archive` renumbered it to
> `MCTG-09` to preserve both requirements without an ID collision; no requirement content was altered by
> the rename. See the archive report for `categoria-unica-por-bucket`.

The mobile `mensajes-catalogo.ts` closed code map's `NOMBRE_DUPLICADO` row (part of the MCTG-06 12-code
table) MUST render the exact literal `'Ya tienes una categoría con ese nombre en ese bucket.'`, replacing
the prior bucket-blind wording. The mapping selection mechanism (by `code` alone) is unchanged from
MCTG-06.
(Previously: `NOMBRE_DUPLICADO` rendered `'Ya tienes una categoría con ese nombre.'`.)

#### Scenario: The exact bucket-aware string renders on a 409 (RNTL)

- GIVEN a `409` response with `code: "NOMBRE_DUPLICADO"`
- WHEN the client maps it to copy
- THEN the rendered string is exactly `'Ya tienes una categoría con ese nombre en ese bucket.'`, never
  `body.message`
