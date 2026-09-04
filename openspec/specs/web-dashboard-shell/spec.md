# Web Dashboard Shell Specification

## Purpose

Defines the Serene Finance visual identity applied in-place to the `apps/web`
"Análisis Mensual" dashboard, plus the net-new responsive navigation shell
(sidebar desktop / bottom tabs mobile) that the authenticated layout
(`_authenticated.tsx`) currently lacks. This
is a restyle + shell addition over already-functional, already-tested screens
— no new data, no new endpoints, no behavior change to drill-down/reclassify
(`web-app` spec).

## Requirements

### Requirement: WDS-01 — Serene Finance token layer renders on dashboard surfaces

The dashboard MUST render using the Serene Finance token layer: off-white
page surface, white cards, soft tonal shadows, 8px default corner radius, and
Inter typography. Bucket-associated color MUST map azul→Necesidades,
lavanda→Gustos, amarillo→Ahorro, coral→exceso/over-budget.

#### Scenario: Dashboard cards use the token layer

- GIVEN the dashboard renders for a period with data
- WHEN the resumen, pie, legend, and detail cards render
- THEN each card shows a white surface, 8px radius, and a soft shadow on the
  off-white page background

#### Scenario: Bucket colors map to the Serene Finance palette

- GIVEN Necesidades, Gustos, Ahorro, and an over-budget bucket are all present
- WHEN their visual indicators render (pie slice, legend swatch, badge)
- THEN each uses its assigned palette color (azul/lavanda/amarillo/coral)

### Requirement: WDS-02 — Responsive nav shell renders per breakpoint

The authenticated layout (`_authenticated.tsx`) MUST render a sidebar
navigation on viewports ≥ `lg` and a bottom tab bar on viewports below `lg`,
both showing the brand and functional nav items to existing routes. Mounting
in `_authenticated.tsx` (rather than `__root.tsx`) keeps `/login` outside the
shell by design.

#### Scenario: Desktop shows a sidebar

- GIVEN the viewport is ≥ `lg`
- WHEN the shell renders
- THEN a sidebar with the brand and nav items is visible, and no bottom tab
  bar is rendered

#### Scenario: Mobile shows bottom tabs

- GIVEN the viewport is below `lg`
- WHEN the shell renders
- THEN a bottom tab bar with nav items is visible, and no sidebar is rendered

### Requirement: WDS-03 — Non-functional nav placeholders are visible but inert

"Subir nuevo archivo", "Configuración", and "Ayuda" MUST render in the shell
but MUST be disabled/inert: they MUST NOT navigate, submit, or trigger any
request when activated by mouse or keyboard.

#### Scenario: Activating a placeholder does nothing

- GIVEN "Subir nuevo archivo" is visible in the shell
- WHEN the user clicks it or activates it via keyboard (Enter/Space)
- THEN no navigation occurs and no request is sent
- AND the control exposes a disabled state to assistive tech

### Requirement: WDS-04 — Dashboard sections are responsive under the new shell

Every primary dashboard section (distribución pie + IDEAL inset, leyenda,
detalle por categoría) MUST render single-column with 16px side margins
below `lg`, and MUST render multi-column on `lg`+.

The resumen anual mini-pie grid is an audited exception: because it is a set
of ~12 compact, equal-size cells (not full-width content blocks), it MAY use
a denser responsive grid — 2 columns below `sm`, 3 on `sm`, 4 on `lg`+ —
rather than a single column, PROVIDED it does not overflow horizontally at
320–375px viewports. A 12-cell single-column list is explicitly rejected as
poor mobile UX.

#### Scenario: Primary sections render single column with 16px margins on mobile

- GIVEN the viewport is below `lg`
- WHEN the pie, leyenda, and detalle sections render
- THEN each section stacks in a single column with 16px side margins

#### Scenario: Resumen anual grid stays a compact multi-column grid without overflow

- GIVEN the viewport is at 320–375px (below `sm`)
- WHEN the resumen anual mini-pie grid renders
- THEN it shows a 2-column grid of equal cells with no horizontal overflow
- AND it widens to 3 columns on `sm` and 4 on `lg`+

#### Scenario: Desktop renders multi-column

- GIVEN the viewport is ≥ `lg`
- WHEN the dashboard sections render
- THEN sections use the existing multi-column layout

### Requirement: WDS-05 — Per-transaction category icons with generic fallback

Each transaction row MUST show an icon keyed by its `categoria`'s canonical
name. An unrecognized or missing categoría name MUST render a generic
fallback icon and MUST NOT throw or leave the row iconless.

#### Scenario: A known categoría shows its mapped icon

- GIVEN a transaction with `categoria: "Supermercado"`
- WHEN the row renders
- THEN the icon mapped to "Supermercado" is shown

#### Scenario: An unknown categoría shows the generic fallback without crashing

- GIVEN a transaction with a categoría name absent from the icon lookup table
- WHEN the row renders
- THEN a generic fallback icon is shown and rendering does not throw

### Requirement: WDS-06 — Category detail header shows an aggregated total badge

The category detail header (per bucket panel) MUST show a badge with the
aggregated total of the categoría's visible transactions, computed
client-side from the already-fetched data (no new endpoint), using
BigInt/string-safe arithmetic.

#### Scenario: Badge shows the exact aggregated total

- GIVEN a categoría group with transactions summing to an amount beyond
  `Number.MAX_SAFE_INTEGER`
- WHEN the header badge computes the total
- THEN every digit is preserved (BigInt/string arithmetic, no float)

### Requirement: WDS-07 — Accessibility semantics are preserved under the restyle (ADR-018)

The restyle MUST change only visual/CSS classes. Existing accessibility
semantics (`role="button"` on SVG slices, `aria-pressed`, heading order,
`role="status"` regions) MUST remain unchanged, and text/background color
pairs MUST meet WCAG 2.2 AA contrast under the new palette.

#### Scenario: SVG slice keeps its interactive semantics

- GIVEN a pie slice was previously reachable via keyboard with `role="button"`
  and `aria-pressed`
- WHEN the restyle is applied
- THEN the slice still exposes `role="button"` and `aria-pressed`, styled
  with the new tokens

#### Scenario: New palette meets contrast requirements

- GIVEN a bucket badge renders with the new palette color as background
- WHEN its contrast ratio against the badge text is measured
- THEN it meets or exceeds WCAG 2.2 AA (4.5:1 normal text / 3:1 large text)

### Requirement: WDS-08 — Money remains BigInt-safe string, never float (invariant)

No component touched by this change MAY introduce `Number()` or
`parseFloat()` on a money field. All money MUST continue to render from the
string/BigInt values already returned by the API.

#### Scenario: A large amount renders without precision loss after restyle

- GIVEN a transaction amount beyond `Number.MAX_SAFE_INTEGER`
- WHEN it renders in the restyled row
- THEN every digit is preserved exactly as returned by the API

### Requirement: WDS-09 — The x-api-key proxy fetch-path is untouched (invariant)

`vite.config.ts`, `src/api/client.ts`, and `apps/web/api/[...path].ts` MUST
NOT be modified by this change. The dashboard's data-fetching behavior
(headers, base URL, proxy routing) MUST be identical before and after.

#### Scenario: Fetch behavior is unchanged after the restyle

- GIVEN the dashboard requests `/api/resumen` before and after this change
- WHEN the two requests are compared
- THEN headers, URL, and proxy routing are identical

### Requirement: WDS-10 — No import from the backend domain layer (ADR-005/008)

Code added or modified by this change MUST NOT import from
`apps/api/src/domain`.

#### Scenario: No cross-boundary import exists

- GIVEN the set of files changed by this change
- WHEN their imports are inspected
- THEN none import from `apps/api/src/domain`

## Non-Goals

- Rebuilding markup from `code.html` (would regress landed WCAG fixes).
- Any change to `apps/mobile` (bucket palettes web/mobile diverge by
  accepted decision).
- A real file-upload flow (placeholder stays inert).
- New backend endpoints (all data already exists).
- Restyling `/login` or the standalone `/buckets/:bucket` route.
- Dark mode.
