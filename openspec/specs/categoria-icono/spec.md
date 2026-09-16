# Categoria Icono Specification (apps/api domain + cross-client contract)

## Purpose

Defines category iconography as a first-class, server-validated attribute: a curated allowlist of
lucide icon names, its validation semantics on create/update, default seeding for newly materialized
catalogs, ownership isolation, client fallback rendering, cross-client allowlist parity, and
accessible-name requirements for icon pickers and badges. Established by change
`categoria-iconografia` (ADR-045).

## Requirements

### Requirement: CATICO-01 — A curated allowlist is the sole authority for icon validity

The system MUST maintain a curated allowlist of lucide icon names as a single domain constant
(pattern: `BUCKETS_ASIGNABLES`), of roughly 24 entries. This allowlist is the ONLY source of truth
for whether an `icono` value is valid — a string that is a real lucide component name but absent
from the allowlist MUST be treated identically to any other invalid value.

#### Scenario: An out-of-allowlist value is invalid even if it is a real lucide name

- GIVEN a lucide icon name that exists in the library but not in the curated allowlist
- WHEN it is submitted as `icono`
- THEN it is rejected exactly as any other unrecognized string would be

### Requirement: CATICO-02 — Category creation validates icono: valid, invalid, or omitted

`POST /api/categorias` MUST accept an optional `icono` field. A value from the curated allowlist
(CATICO-01) MUST be persisted. A value absent from the allowlist MUST be rejected with
`400 ICONO_INVALIDO`, and the category MUST NOT be created. Omitting `icono` MUST persist `null`.

#### Scenario: A valid icono is persisted on create

- GIVEN an authenticated non-demo user
- WHEN they POST `{ nombre: "Mascotas", bucket: "Deseos", icono: "paw-print" }` with an allowlisted value
- THEN the response is `201` and the created category's `icono` is `"paw-print"`

#### Scenario: An invalid icono is rejected on create

- GIVEN an authenticated non-demo user
- WHEN they POST a category with `icono: "not-a-real-icon"`
- THEN the response is `400 ICONO_INVALIDO` and no category is created

#### Scenario: Omitting icono on create persists null

- GIVEN an authenticated non-demo user
- WHEN they POST `{ nombre: "Mascotas", bucket: "Deseos" }` with no `icono` field
- THEN the response is `201` and the created category's `icono` is `null`

### Requirement: CATICO-03 — Category update validates icono with set/clear/leave-unchanged semantics

`PATCH /api/categorias/:id` MUST accept an optional `icono` field with three-way semantics: a
value from the curated allowlist (CATICO-01) sets that icon; an explicit `icono: null` clears it,
after which the category renders the generic fallback (CATICO-06); omitting the field MUST leave the
stored `icono` unchanged. A non-null value absent from the allowlist MUST be rejected with
`400 ICONO_INVALIDO`, and the row MUST remain unchanged.

#### Scenario: A valid icono is set on update

- GIVEN a category owned by the caller, currently `icono: null`
- WHEN they PATCH `{ icono: "house" }` with an allowlisted value
- THEN the response is `200` and the category's `icono` is `"house"`

#### Scenario: Explicit null clears a previously set icono

- GIVEN a category owned by the caller with `icono: "house"`
- WHEN they PATCH `{ icono: null }`
- THEN the response is `200` and the category's `icono` is `null`

#### Scenario: Omitting icono on update leaves it unchanged

- GIVEN a category owned by the caller with `icono: "house"`
- WHEN they PATCH `{ nombre: "Casa" }` with no `icono` field
- THEN the response is `200` and the category's `icono` is still `"house"`

#### Scenario: An invalid icono is rejected on update, row unchanged

- GIVEN a category owned by the caller with `icono: "house"`
- WHEN they PATCH `{ icono: "not-a-real-icon" }`
- THEN the response is `400 ICONO_INVALIDO` and the category's `icono` is still `"house"`

### Requirement: CATICO-04 — Newly materialized catalogs carry default icons; no backfill for existing rows

Each of the 8 `catalogo-template.ts` categories MUST carry a backend-authored default `icono`. Every
code path that materializes a new user's catalog by copying the template — the bootstrap seed, demo
user creation, and Google signup-on-first-login (ADR-041) — MUST copy each category's default
`icono` verbatim. Materializing a catalog MUST NOT alter or backfill the `icono` of any pre-existing
`Categoria` row; a row created before this change MUST remain `icono: null` until explicitly set via
CATICO-03.

#### Scenario: A new bootstrap/demo/Google-signup user gets seed defaults

- GIVEN a new user is created through any of the three catalog-materializing entry points
- WHEN their catalog copy completes
- THEN each of the 8 categories carries its template-defined default `icono`

#### Scenario: A pre-existing category is never backfilled

- GIVEN a `Categoria` row that existed before this change, with `icono: null`
- WHEN any catalog-materialization or unrelated read/write path runs
- THEN that row's `icono` remains `null` until an explicit `PATCH` sets it

### Requirement: CATICO-05 — Icon writes are owner-scoped (RNF-SEC-006)

Every `icono` write MUST resolve against a `Categoria` row scoped to the caller's own `userId` — the
same ownership gate CAT038-07 already enforces for every catalog mutation. No dedicated icon
endpoint or bypass path MUST exist.

#### Scenario: A caller cannot set another user's category icono

- GIVEN user B's real category id
- WHEN user A PATCHes that id with `{ icono: "house" }`
- THEN the response is `404`, and user B's category is unaffected

### Requirement: CATICO-06 — Null icono renders a consistent generic fallback

A category whose `icono` is `null` or absent MUST render a single, consistent generic fallback icon
on every client surface that renders category icons. The fallback MUST NOT be treated as an error
state and MUST NOT block rendering of the category's name, bucket color, or any other field.

#### Scenario: A null icono renders the fallback without error

- GIVEN a category with `icono: null`
- WHEN any surface renders its icon
- THEN the generic fallback icon renders, and the category's name and bucket color render normally

### Requirement: CATICO-07 — The curated allowlist stays in parity across api, web, and mobile

`apps/api`'s curated allowlist (CATICO-01) MUST be mirrored verbatim as a static render map in
`apps/web` and `apps/mobile` (pattern: `catalogo-constantes.mirror.spec.ts`). Each client MUST
maintain its own drift-guard test that fails when its local icon-name set diverges from the backend's
source list.

#### Scenario: A backend-only addition fails each client's mirror spec

- GIVEN a new name is added to the backend allowlist but not to a client's static render map
- WHEN that client's mirror spec runs
- THEN it fails, naming the drift

### Requirement: CATICO-08 — Icon pickers and badges meet accessible-name and decorative-icon semantics (WCAG 2.2 AA)

Every icon picker option MUST expose a human-readable accessible name for the icon it represents
(e.g. "Hogar"), never the raw lucide identifier (e.g. `home`). An icon rendered alongside the
category's own visible name or a labelled control MUST be exposed as decorative to assistive
technology (hidden, never double-announced with the visible text). An icon that is itself the only
accessible content of a control MUST carry its own accessible name.

#### Scenario: A picker option exposes a readable accessible name

- GIVEN the icon picker renders its allowlisted options
- WHEN an assistive-technology user inspects one option
- THEN its accessible name is a human-readable label, never the raw lucide identifier

#### Scenario: A badge icon next to the category's name is decorative

- GIVEN a category badge rendering both its icon and its visible name
- WHEN assistive technology inspects the badge
- THEN the icon is hidden from the accessibility tree and only the name is announced once
