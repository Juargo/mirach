# Mobile Resumen Screen Specification

## Purpose

Defines the read-only Expo screen (`apps/mobile`) that renders `GET /api/resumen` — income, 50/30/20 buckets, and semáforo — with BigInt-safe money formatting (ADR-015 money emphasis) and the loading/empty/error/data states the Maestro flow asserts against. As of the US-050 redesigned dashboard (change `us-050-mobile-dashboard`, 2026-08-17, issue #284), the data state composes a 4-item donut ring, 5-row legend, static semáforo tag, and an annual section — see MOB-08..MOB-15.

## Requirements

### Requirement: MOB-01 — HTTP client sends the API key and targets the configured base URL

The HTTP client MUST send `x-api-key: EXPO_PUBLIC_API_KEY` on every request to `GET {EXPO_PUBLIC_API_BASE_URL}/api/resumen`.

#### Scenario: Request includes required headers and URL

- GIVEN `EXPO_PUBLIC_API_BASE_URL` and `EXPO_PUBLIC_API_KEY` are set
- WHEN the screen requests the resumen for the current period
- THEN the request is `GET {EXPO_PUBLIC_API_BASE_URL}/api/resumen?periodo=YYYY-MM`
- AND the request header `x-api-key` equals `EXPO_PUBLIC_API_KEY`

### Requirement: MOB-02 — HTTP client maps failures to typed error states, never crashes

The client MUST map a 401 response, a network failure, and a malformed/unparseable JSON payload to distinct typed error states, and MUST NOT throw an unhandled exception that crashes the screen.

#### Scenario: 401 response maps to an auth error state

- GIVEN the server returns HTTP 401
- WHEN the client processes the response
- THEN the result is a typed error state indicating unauthorized access
- AND the screen does not crash

#### Scenario: Network failure maps to a network error state

- GIVEN the fetch call rejects (e.g., no connectivity, DNS failure)
- WHEN the client catches the failure
- THEN the result is a typed error state indicating a network problem
- AND the screen does not crash

#### Scenario: Malformed payload maps to a parse error state

- GIVEN the server returns HTTP 200 with a body that is not valid `ResumenMesDto` JSON
- WHEN the client attempts to parse it
- THEN the result is a typed error state indicating a parse failure
- AND the screen does not crash

### Requirement: MOB-03 — Screen renders four explicit states, the data state composing the redesigned dashboard

The screen MUST render exactly one of: loading, empty (`sinIngreso: true`),
error, or data — and MUST NOT render partial/undefined content while
transitioning. The data state MUST compose the 4-item donut ring + 5-row
legend (MOB-08), the static semáforo tag (MOB-09), and the annual section
(MOB-10) — replacing the Sprint-3 three-bucket-only breakdown.

> Note: the base spec's MOB-03 required a per-bucket `estadoSemaforo`
> indicator; that indicator was already dead in shipped code (never
> rendered by `LeyendaGasto`/`ResumenScreen`) and is deliberately retired
> by this MODIFIED replacement, not silently dropped.

#### Scenario: Loading state while the request is in flight

- GIVEN the screen has just mounted
- WHEN the resumen request has not yet resolved
- THEN a loading indicator is shown
- AND no bucket data or error copy is shown
- AND the annual section still renders (it owns its own fetch/states,
  independently of the main chart's loading state — MOB-12)

#### Scenario: Empty state when there is no income

- GIVEN the API responds 200 with `sinIngreso: true`
- WHEN the screen renders the response
- THEN an empty-state message distinct from "0%" is shown in place of the
  chart card
- AND the annual section still renders (MOB-14 — deliberate mobile
  divergence from web's whole-screen short-circuit)

#### Scenario: Error state on any mapped failure

- GIVEN the client produced a typed error state (401, network, or parse —
  MOB-02)
- WHEN the screen renders that state
- THEN error copy appropriate to the failure type is shown
- AND no stale/partial bucket data, ring, or legend is shown
- AND the annual section still renders (it owns its own fetch/states,
  independently of the main chart's error state — MOB-12)

#### Scenario: Data state renders the ring, legend, semáforo tag, and annual section

- GIVEN the API responds 200 with `sinIngreso: false` and 4 buckets
  (`Necesidades`, `Deseos`, `Ahorro`, `SinCategoria`)
- WHEN the screen renders the response
- THEN `totalIngreso` is shown formatted as CLP (MOB-05)
- AND the donut ring shows 4 slices per MOB-08
- AND the legend shows 5 rows per MOB-08
- AND the semáforo tag renders `estadoGlobal` per MOB-09
- AND the annual section (MOB-10) renders below the chart card

### Requirement: MOB-04 — Screen satisfies the Maestro contract independent of login

The screen MUST expose the text "Distribución del gasto", the bucket display labels "Necesidades", "Gustos", "Ahorro" (per `ETIQUETA_BUCKET` — the `Deseos` bucket renders as "Gustos"), and an element with `testID: "semaforo-global"`, reachable without any login flow.

> Reconciled at the us-050-mobile-dashboard archive (2026-08-17): the original text asserted "Distribución 50/30/20" and the literal "Deseos" — both had drifted from the shipped code and the real Maestro fixtures (`resumen-semaforo.yaml` asserts "Distribución del gasto" and "Gustos"). Documented as pre-existing drift during that change's spec phase; aligned here.

#### Scenario: Maestro assertions pass without running login.yaml

- GIVEN the app is launched fresh (no login flow exists)
- WHEN `resumen-semaforo.yaml` runs
- THEN "Distribución del gasto" is visible
- AND "Necesidades", "Gustos", "Ahorro" are each visible
- AND the element with `testID: "semaforo-global"` is visible

### Requirement: MOB-05 — CLP formatting is BigInt-string-safe and never uses parseFloat/Number on the amount

`formatearMontoCLP` MUST accept a decimal-digit string (as returned by `ResumenMesDto.totalIngreso` / `BucketResumenDto.total`) and MUST format it using `BigInt`/string-digit operations only — never `parseFloat` or `Number()` on the amount.

#### Scenario: Standard positive amount formats with thousands separators

- GIVEN the amount string `"1234567"`
- WHEN `formatearMontoCLP` formats it
- THEN the result is `"$1.234.567"`

#### Scenario: Large amount beyond safe-integer precision formats exactly

- GIVEN the amount string `"9007199254740993"` (exceeds `Number.MAX_SAFE_INTEGER`)
- WHEN `formatearMontoCLP` formats it
- THEN every digit is preserved exactly as in the input (no precision loss from a `Number()`/`parseFloat` conversion)

#### Scenario: Zero amount formats as zero

- GIVEN the amount string `"0"`
- WHEN `formatearMontoCLP` formats it
- THEN the result is `"$0"`

#### Scenario: Negative amount formats with a leading minus sign

- GIVEN the amount string `"-5000"`
- WHEN `formatearMontoCLP` formats it
- THEN the result is `"-$5.000"`

### Requirement: MOB-06 — Percentage rendering distinguishes null from 0%

Rendering of `porcentajeBp` MUST NOT display `null` as `"0%"`; `null` MUST render as an explicit non-percentage indicator (e.g., "—" or omitted), while a true `0` basis-point value renders as `"0%"`.

#### Scenario: null porcentajeBp does not render as 0%

- GIVEN a bucket slice with `porcentajeBp: null` (sinIngreso path)
- WHEN the screen renders that bucket
- THEN the percentage shown is NOT `"0%"`

#### Scenario: True zero basis points renders as 0%

- GIVEN a bucket slice with `porcentajeBp: 0`
- WHEN the screen renders that bucket
- THEN the percentage shown is `"0%"`

### Requirement: MOB-07 — Dead login flow is removed

`apps/mobile/.maestro/login.yaml` MUST be removed, and `resumen-semaforo.yaml` MUST NOT reference it (`runFlow: login.yaml`).

#### Scenario: login.yaml no longer exists and is not referenced

- GIVEN the `apps/mobile/.maestro/` directory after this change
- WHEN its contents are listed
- THEN `login.yaml` is absent
- AND `resumen-semaforo.yaml` contains no `runFlow: login.yaml` step

### Requirement: MOB-08 — Chart card renders a 4-item donut ring and a 5-row legend, with each legend row a pressable navigation target

The donut ring MUST apportion its slices over the 4 canonical buckets
(`Necesidades`, `Deseos`, `Ahorro`, `SinCategoria`, per `BUCKETS_ANILLO`
semantics, US-047 WG5-13) using the ported largest-remainder apportionment,
not the 3-bucket-only apportionment. The legend MUST render exactly 5 rows in
this order: `Necesidades`, `Deseos` (labeled "Gustos"), `Ahorro` — each with
its ring `porcentaje` and signed CLP amount — then `Ingresos` (signed `+`,
`totalIngreso`) and `Sin categoría · {cantidadSinCategoria} tx` (signed `-`).
Money amounts in the legend MUST be formatted via the signed CLP formatter
(never `parseFloat`/`Number` on the amount — MOB-05's discipline applies to
this formatter too).

Each of the 5 legend rows MUST be a `Pressable` (`accessibilityRole="button"`)
with an explicit Spanish accessibility label and a `testID` following the
`"leyenda-fila-{key}"` pattern (e.g. `testID="leyenda-fila-Necesidades"`,
`testID="leyenda-fila-Deseos"`, `testID="leyenda-fila-Ahorro"`, `testID="leyenda-fila-ingreso"`,
`testID="leyenda-fila-SinCategoria"`). Pressing a spend-bucket row MUST call
the `onNavegar` callback with the exact path string (e.g. `/bucket/Necesidades?periodo=2026-07`).
Pressing the `SinCategoria` row MUST call `onNavegar` with the exact string
`/bucket/SinCategoria?destacar=sin-categoria&periodo=${periodo}`.
Pressing the `Ingresos` row MUST call `onNavegar` with the exact string
`/ingresos?periodo=${periodo}`.
The `onNavegar` callback (required prop, passed from `index.tsx` as `router.push`) is
what actually calls `router.push` at the route level — tests on `LeyendaGasto`
assert `onNavegar` was called with the EXACT path string; tests on `index.tsx`
assert `router.push` receives it. The `periodo` threaded to each push MUST be
the dashboard's currently selected period from `app/index.tsx` local state
(MOB-13) — not always the backend-resolved current month. The donut SVG
ring (`accessibilityLabel="Distribución del gasto"`) remains decorative and
MUST NOT have per-slice press handlers (D-01).

(Previously: legend rows rendered `porcentaje` + signed CLP and were explicitly
non-interactive — US-050 binding decision 2 mandated no pressability, no
chevrons, no navigation. This MODIFIED requirement reverses that decision for
the 5 legend rows ONLY, adding `Pressable` wrappers and three navigation
targets while leaving the donut SVG itself decorative and unpressable.
Updated by change `us-056-mobile-detalle-mes` (2026-08-21, issue #290).)

#### Scenario: SinCategoria with a nonzero total dilutes the three spend-bucket ring percentages (RNTL)

- GIVEN a resumen response where `SinCategoria.total` is nonzero alongside
  nonzero `Necesidades`/`Deseos`/`Ahorro` totals
- WHEN the ring computes its 4 slice percentages
- THEN `SinCategoria` receives its own nonzero slice
- AND the `Necesidades`/`Deseos`/`Ahorro` percentages are the SAME numbers
  shown in the legend rows for those buckets (no independent
  re-normalization to 3 buckets in the legend)
- AND all 4 slice percentages sum to exactly 100

#### Scenario: Legend renders 5 rows in the fixed order with signed amounts (RNTL)

- GIVEN a resumen response with `sinIngreso: false`, 4 buckets, and
  `cantidadSinCategoria: 3`
- WHEN the legend renders
- THEN the rows appear in order: Necesidades, Gustos, Ahorro, Ingresos, "Sin
  categoría · 3 tx"
- AND the Necesidades/Gustos/Ahorro/Sin-categoría rows show a `-` sign
  amount
- AND the Ingresos row shows a `+` sign amount equal to `totalIngreso`

#### Scenario: cantidadSinCategoria of zero still renders an explicit "0 tx" row (RNTL)

- GIVEN `cantidadSinCategoria: 0` in the resumen response
- WHEN the legend renders the "Sin categoría" row
- THEN the row shows "Sin categoría · 0 tx", never omitted and never blank

#### Scenario: No spending yields an empty ring without dividing by zero (RNTL)

- GIVEN all 4 bucket totals are `"0"`
- WHEN the ring renders
- THEN it shows a muted placeholder instead of computing a percentage split
- AND the Necesidades/Gustos/Ahorro rows (`leyendaPrincipal`) are absent,
  per the underlying `calcularDistribucionGasto([])` contract
- AND the Ingresos and Sin categoría rows (`leyendaComplemento`) still
  render regardless of spending — Sin categoría shows its explicit "0 tx" /
  $0, never absent

#### Scenario: Tapping a spend-bucket legend row navigates to M1 with the current periodo (RNTL)

- GIVEN the dashboard is showing `periodo="2026-07"` (local state, MOB-13)
- AND the legend row for `Necesidades` has `testID="leyenda-fila-Necesidades"`
- WHEN the user presses that row
- THEN `onNavegar` is called with the exact string `/bucket/Necesidades?periodo=2026-07` — the currently-selected period, not a hardcoded current month

#### Scenario: Tapping Gustos (Deseos) row navigates to M1 for the Deseos bucket (RNTL)

- GIVEN the dashboard is showing `periodo="2026-06"`
- WHEN the user presses the row labeled `"Gustos"` (`testID="leyenda-fila-Deseos"`)
- THEN `onNavegar` is called with the exact string `/bucket/Deseos?periodo=2026-06` — the wire key `Deseos` (not the display label `Gustos`) is used as the route segment; a display-label-as-segment implementation fails this scenario

#### Scenario: Tapping Sin categoría row navigates to M1 with destacar param (RNTL)

- GIVEN the dashboard is showing `periodo="2026-05"`
- WHEN the user presses the `"Sin categoría · N tx"` row (`testID="leyenda-fila-SinCategoria"`)
- THEN `onNavegar` is called with the exact string `/bucket/SinCategoria?destacar=sin-categoria&periodo=2026-05`

#### Scenario: Tapping Ingresos row navigates to M2 with the current periodo (RNTL)

- GIVEN the dashboard is showing `periodo="2026-07"`
- WHEN the user presses the `"Ingresos"` row (`testID="leyenda-fila-ingreso"`)
- THEN `onNavegar` is called with the exact string `/ingresos?periodo=2026-07`

#### Scenario: Donut SVG has no per-slice press handler (RNTL)

- GIVEN the chart card has rendered with 4 non-zero slices
- WHEN the SVG element with `accessibilityLabel="Distribución del gasto"` is inspected
- THEN no child element inside the SVG has an `onPress` handler
- AND the SVG `accessibilityLabel` remains `"Distribución del gasto"` unchanged

#### Scenario: All 5 legend rows carry accessibilityRole="button" (RNTL)

- GIVEN the data state has rendered with income data present
- WHEN all legend row elements are queried by `testID` regex `/^leyenda-fila-/` (RNTL accepts string-exact or regex — glob is not a valid query form)
- THEN exactly 5 elements are found and each has `accessibilityRole="button"`

### Requirement: MOB-09 — The semáforo tag is a static, non-interactive indicator

The chart card's semáforo tag MUST render `estadoGlobal` ('verde'|'amarillo'|'rojo'|null)
as a visual indicator only. It MUST NOT be a `Pressable`/`TouchableOpacity`,
MUST NOT expose `accessibilityRole="button"` or `"link"`, MUST NOT have an
`onPress` handler, and MUST NOT render a chevron or any other
navigation affordance (proposal Out-of-Scope decision 1).

#### Scenario: Semáforo tag has no accessible action

- GIVEN the data state has rendered with `estadoGlobal: 'rojo'`
- WHEN the semáforo tag element is queried for its accessibility role
- THEN it is NOT `"button"` and NOT `"link"`
- AND it exposes no `onPress`/press handler
- AND no chevron icon is rendered next to it

#### Scenario: null estadoGlobal still renders a visible "sin datos" tag

- GIVEN `estadoGlobal: null`
- WHEN the semáforo tag renders
- THEN a distinct "sin datos" visual state is shown (never omitted)
- AND it remains non-interactive per the scenario above

### Requirement: MOB-10 — Annual section fetches and renders 12 monthly cells for the current year

The screen MUST fetch `GET /api/resumen/anual` (no `anio` query param, so the
backend resolves the current year) via a new `fetchResumenAnual` client
function mirroring `fetchResumen`'s `ApiResult`/`ApiError` shape and header
construction (`x-api-key` + session-aware `Authorization`), and MUST render
exactly 12 cells (one per `meses[]` entry, Enero→Diciembre) in a section that
owns its own loading/error/empty states independently of the main chart
card's state (MOB-12).

#### Scenario: Annual request includes required headers and targets the resolved-year endpoint

- GIVEN `EXPO_PUBLIC_API_BASE_URL` and `EXPO_PUBLIC_API_KEY` are set
- WHEN the annual section requests the current year's breakdown
- THEN the request is `GET {EXPO_PUBLIC_API_BASE_URL}/api/resumen/anual`
- AND the request header `x-api-key` equals `EXPO_PUBLIC_API_KEY`

#### Scenario: Annual data state renders 12 cells with the selected month highlighted

- GIVEN the annual response resolves with `anio: 2026` and 12 `meses` entries
- WHEN the annual section renders
- THEN exactly 12 cells are shown, one per month
- AND the cell whose `periodo` equals the screen's currently selected period
  (MOB-13) is visually marked as selected
- AND cells for months other than the selected one are not marked selected

#### Scenario: A month without data renders as a non-tappable cell

- GIVEN a `meses[]` entry has `sinIngreso: true`
- WHEN that month's cell renders
- THEN the cell exposes no `onPress` handler (or an explicitly disabled
  press affordance that never fires `onSelectPeriodo`)
- AND tapping that cell does not change the main chart's displayed period

#### Scenario: Annual cells carry no per-month semáforo tag

- GIVEN any `meses[]` entry, with or without data
- WHEN that month's cell renders
- THEN no semáforo indicator is rendered on the cell (proposal Closed
  Question 3 — divergence from web's `MiniSemaforoTag`)

### Requirement: MOB-11 — Tapping an annual cell with data switches the main chart to that month

Tapping a `meses[]` cell whose `sinIngreso` is `false` MUST update the
screen's selected period (MOB-13) to that cell's `periodo` and cause the main
chart card (ring, legend, semáforo tag, `totalIngreso`) to re-render with
that month's data.

#### Scenario: Tapping a month with data re-renders the main chart with that month's totals

- GIVEN the main chart currently shows period `"2026-06"`
- AND an annual cell for `"2026-04"` has `sinIngreso: false`
- WHEN the user taps the `"2026-04"` cell
- THEN the screen's selected period becomes `"2026-04"`
- AND the main chart card re-renders showing `"2026-04"`'s `totalIngreso`,
  ring, legend, and semáforo state
- AND the `"2026-04"` cell is now the visually-marked selected cell (MOB-10)

### Requirement: MOB-12 — The annual section's fetch failure never blanks the main chart card

The annual section MUST own an independent `{loading|error|data}` state from
the main chart card's fetch. A failure or loading state in the annual
section MUST NOT replace, hide, or block the rendering of the main chart
card, and vice versa.

#### Scenario: Annual fetch failure leaves the main chart card intact

- GIVEN the main `/api/resumen` fetch has resolved successfully with data
- WHEN the `/api/resumen/anual` fetch fails (network, 401, or parse error)
- THEN the main chart card (ring, legend, semáforo tag, `totalIngreso`)
  continues to render normally
- AND the annual section shows its own error state in its place

#### Scenario: Annual section loading does not block the main chart card

- GIVEN the main `/api/resumen` fetch has resolved successfully with data
- WHEN the `/api/resumen/anual` fetch is still in flight
- THEN the main chart card is already visible
- AND the annual section shows its own loading indicator, not a blank screen

### Requirement: MOB-13 — Month selection is local UI state, defaulting to the current month and resetting on restart

The selected period MUST be held as local component state in
`app/index.tsx` (or an equivalent screen-owned state), initialized to
`undefined` so `fetchResumen()` is called without a `periodo` query param and
the backend resolves the current month. Selecting an annual cell (MOB-11)
MUST update this local state. No persistence mechanism (storage, deep link,
route param) MAY back this state — a fresh app launch MUST discard any prior
selection.

#### Scenario: Fresh mount defaults to the backend-resolved current month

- GIVEN the screen has just mounted with no prior selection
- WHEN the main resumen request fires
- THEN the request is `GET {EXPO_PUBLIC_API_BASE_URL}/api/resumen` with no
  `periodo` query param

#### Scenario: Selection does not survive an app restart

- GIVEN the user selected `"2026-03"` via the annual grid in a prior session
- WHEN the app is relaunched (a fresh mount, not a re-render)
- THEN the main chart requests the current month again (no `periodo` param),
  not `"2026-03"`

### Requirement: MOB-14 — The sinIngreso empty state replaces only the chart card, not the whole screen

When the main resumen response has `sinIngreso: true`, the screen MUST
render the empty-state message in place of the chart card (ring/legend/
semáforo tag) ONLY. The annual section (MOB-10) MUST continue to render and
fetch independently. This is a deliberate divergence from web's
whole-screen short-circuit on `sinIngreso`: on mobile the annual grid is the
only month-navigation affordance, so blanking it would strand the user on an
empty current month with no way to reach a month that does have data.

#### Scenario: sinIngreso month still shows a usable annual grid

- GIVEN the main resumen response has `sinIngreso: true` for the current
  month
- WHEN the screen renders
- THEN the chart card area shows the empty-state message, not a ring or
  legend
- AND the annual section renders its 12 cells as usual
- AND tapping an annual cell with data (MOB-11) switches the main chart away
  from the empty state

### Requirement: MOB-15 — The IDEAL 50/30/20 inset and the "Ver detalles ›" affordance are removed

The chart card MUST NOT render the small "IDEAL" reference pie inset that
the Sprint-3 screen drew bottom-right of the main pie, and MUST NOT render
the "Ver detalles ›" button below the legend. Neither wireframe M1 nor the
redesigned web dashboard renders these (proposal Closed Questions 2 and 4);
no replacement destination exists for "Ver detalles ›" now that navigation
is out of scope for this change.

#### Scenario: Data state renders without the IDEAL inset

- GIVEN the data state has rendered with `sinIngreso: false`
- WHEN the chart card is queried
- THEN no element labeled "IDEAL" or an ideal/target reference pie is present

#### Scenario: Data state renders without the "Ver detalles" button

- GIVEN the data state has rendered with `sinIngreso: false`
- WHEN the chart card is queried
- THEN no element with the text "Ver detalles ›" or an equivalent
  `accessibilityRole="button"` beneath the legend is present
