# Mobile Detalle Mes Specification

## Purpose

Defines the two drill-down screens for `apps/mobile` — M1 (Bucket Month Detail) and M2 (Ingresos Month Detail) — that close the web↔mobile parity gap for monthly bucket and income detail. The M1 screen (`app/bucket/[bucket].tsx`) consumes `GET /api/buckets/{bucket}/detalle` with grouping by category and supports reclassification via `PATCH /api/transacciones/{id}/categoria`. The M2 screen (`app/ingresos.tsx`) consumes `GET /api/ingresos/mes` and is read-only. Both screens include a shared `SelectorPeriodoMes` component for month navigation. Web parity references: `bucket-detalle-mes` (web M1 equivalent) and `ingresos-detalle-mes` (web M2 equivalent). No new backend endpoints or business rules are introduced (ADR-024).

Established by change `us-056-mobile-detalle-mes` (2026-08-21, issue #290).

Requirement prefix: `MDET-*` (verified collision-free with MOB/MCFG/MCTG).

## Requirements

### Requirement: MDET-01 — M1 route and three-tag fetch state machine

`app/bucket/[bucket].tsx` MUST register under `<Stack.Protected>` in `_layout.tsx`, read `bucket` and optional `destacar` via `useLocalSearchParams`, and manage exactly three discriminated tags — `loading`, `error`, and `data` — using `useState` and a `fetch`-on-mount pattern (no TanStack Query, D-03). The `empty` condition is NOT a fourth tag; it is a sub-state derived inside the `data` tag from `viewModel.grupos.length === 0` (D-12), matching the web `BucketDetalleMesPage.tsx:182` pattern. The native stack back gesture MUST return to the dashboard without fetching it.

#### Scenario: Loading state shown while request is in flight (RNTL)

- GIVEN `app/bucket/[bucket].tsx` has just mounted with `bucket="Necesidades"` and `periodo="2026-07"`
- WHEN `fetchDetalleBucketMes` has not yet resolved
- THEN a loading indicator is shown and no group content or error copy is visible

#### Scenario: Error state shown on any mapped failure (RNTL)

- GIVEN `fetchDetalleBucketMes` returns a typed error (network, 401, or parse)
- WHEN the screen renders that state
- THEN error copy appropriate to the failure type is shown and no stale data renders

#### Scenario: Empty state shown when the bucket has no transactions (RNTL)

- GIVEN the API responds 200 with an empty `grupos` array (`grupos: []`)
- WHEN the screen renders the `data` tag and derives `viewModel.grupos.length === 0`
- THEN an empty-state message is shown in place of the group list

#### Scenario: Data state renders header and group list (RNTL)

- GIVEN the API responds 200 with at least one group
- WHEN the screen renders the `data` tag
- THEN MDET-02 header and the MDET-03 group list are both visible

---

### Requirement: MDET-02 — M1 header content and sinMeta/sinPorcentaje fallbacks

The M1 header MUST render: the bucket's display label via `ETIQUETA_BUCKET` (e.g. `Deseos` → `"Gustos"`), the `SelectorPeriodoMes` component (MDET-04), a usage bar, `porcentajeLabel` (basis-point-safe, `null` → `"—"` per MOB-06 discipline), `metaLabel` (`null` → `"Sin meta"` flag), `totalLabel` (CLP string-safe), and `conteoLabel`. All labels are produced by `aDetalleBucketMesViewModel` — the component renders pre-formatted strings, no re-computation (ADR-024).

#### Scenario: Header renders display label, not raw bucket key (RNTL)

- GIVEN `bucket="Deseos"` in params
- WHEN the M1 header renders
- THEN the visible text is `"Gustos"` — the `ETIQUETA_BUCKET` display label — not the raw string `"Deseos"` (non-trivial mapping; a raw-key implementation fails this scenario)

#### Scenario: sinMeta bucket renders the explicit "Sin meta" flag (RNTL)

- GIVEN `aDetalleBucketMesViewModel` produces `sinMeta: true`
- WHEN the M1 header renders
- THEN the text `"Sin meta"` is visible and `"null"` or `"%"` is not rendered for the meta field

#### Scenario: sinPorcentaje bucket renders "—" not "0%" (RNTL)

- GIVEN `aDetalleBucketMesViewModel` produces `sinPorcentaje: true`
- WHEN the M1 header renders
- THEN the porcentaje field shows `"—"` (matching `SIN_PORCENTAJE_LABEL`), not `"0%"`

---

### Requirement: MDET-03 — GrupoMovimientosMobile: expandable groups and SinCategoria destacado

M1 MUST render one `GrupoMovimientosMobile` per group from `aDetalleBucketMesViewModel`. Each group MUST show a header with categoría name, subtotal, and conteo. Groups with more than 3 rows MUST show the first 3 rows and a `"Ver N más"` pressable that reveals the rest (`accessibilityState={{ expanded: false/true }}`). The `SinCategoria` group ALWAYS carries the stable `testID="grupo-movimientos-sin-categoria"` on its root container. When the URL param `destacar=sin-categoria` is present, an INNER highlight wrapper with `testID="grupo-sin-categoria-destacado"` MUST be rendered INSIDE the `SinCategoria` group root and carry a distinct visual style compared to other groups; this inner wrapper is ONLY rendered when `destacar` is active. Both the stable root testID and the conditional inner testID MUST be asserted independently in the test for the destacado scenario.

#### Scenario: Group with 5 rows shows 3 + "Ver 2 más" collapsed (RNTL)

- GIVEN a group has 5 transaction rows
- WHEN the group first renders
- THEN exactly 3 rows are visible and a pressable with text `"Ver 2 más"` is shown
- AND `accessibilityState={{ expanded: false }}` is set on that pressable

#### Scenario: Tapping "Ver N más" expands to show all rows (RNTL)

- GIVEN the "Ver N más" pressable is visible
- WHEN the user presses it
- THEN all 5 rows are visible and the pressable text changes to `"Ver menos"`
- AND `accessibilityState={{ expanded: true }}` is set on that pressable

#### Scenario: SinCategoria group is highlighted when destacar param is set (RNTL)

- GIVEN `useLocalSearchParams` returns `{ bucket: "SinCategoria", destacar: "sin-categoria" }`
- WHEN the screen renders
- THEN the SinCategoria group's root container carries `testID="grupo-movimientos-sin-categoria"` (always present)
- AND an INNER element with `testID="grupo-sin-categoria-destacado"` is rendered inside it with a distinct visual style — this inner wrapper is only present when `destacar` is active

#### Scenario: Groups without the destacar param render without highlight (RNTL)

- GIVEN `useLocalSearchParams` returns `{ bucket: "Necesidades" }` (no `destacar`)
- WHEN the screen renders
- THEN the SinCategoria group root still carries `testID="grupo-movimientos-sin-categoria"`
- AND no element with `testID="grupo-sin-categoria-destacado"` exists anywhere in the tree

---

### Requirement: MDET-04 — SelectorPeriodoMes reusable component

`SelectorPeriodoMes` MUST render a `‹ {mesLabel} ›` row where each arrow is a `Pressable` (`accessibilityRole="button"`) labeled `"Mes anterior"` and `"Mes siguiente"`. Pressing `‹` MUST decrement the period by one month; pressing `›` MUST increment it. The component MUST accept `periodo` (`string | undefined`, `YYYY-MM` or `undefined` → backend resolves current month) and `onChange` callback (`(periodo: string) => void`), and be consumed by both MDET-01 (M1) and MDET-06 (M2). Period arithmetic MUST use a pure function (prev/next month) that correctly wraps December→January and January→December. The `›` arrow MUST carry `accessibilityState={{ disabled: true }}` and be inert when the current period equals the current calendar month; the `‹` arrow is always enabled.

#### Scenario: Pressing the left arrow decrements the period (RNTL)

- GIVEN `SelectorPeriodoMes` is rendered with `periodo="2026-07"`
- WHEN the user presses the `‹` button (`accessibilityLabel="Mes anterior"`)
- THEN `onChange` is called with `"2026-06"`

#### Scenario: Period wraps from January to December of the prior year (RNTL)

- GIVEN `SelectorPeriodoMes` is rendered with `periodo="2026-01"`
- WHEN the user presses the `‹` button
- THEN `onChange` is called with `"2025-12"`

#### Scenario: Period wraps from December to January of the next year (RNTL)

- GIVEN `SelectorPeriodoMes` is rendered with `periodo="2026-12"`
- WHEN the user presses the `›` button (`accessibilityLabel="Mes siguiente"`)
- THEN `onChange` is called with `"2027-01"`

#### Scenario: mesLabel reflects the current period (RNTL)

- GIVEN `SelectorPeriodoMes` is rendered with `periodo="2026-07"`
- WHEN it renders
- THEN the label text is the formatted month string for July 2026 (derived from the existing `mesCompletoLabel` or equivalent helper — e.g. `"julio 2026"`)

#### Scenario: Next arrow is disabled and inert at the current calendar month (RNTL)

- GIVEN `SelectorPeriodoMes` is rendered with `periodo` equal to the current calendar month (e.g. `"2026-08"`)
- WHEN the user inspects and attempts to press the `›` button
- THEN the `›` `Pressable` has `accessibilityState={{ disabled: true }}` and pressing it does NOT call `onChange`

#### Scenario: `periodo=undefined` renders the current-month label (RNTL)

- GIVEN `SelectorPeriodoMes` is rendered with `periodo={undefined}`
- WHEN it renders
- THEN the label text reflects the current calendar month derived via `periodoActualUTC` fallback (D-13), and the `›` arrow is disabled

---

### Requirement: MDET-05 — RN reclassify control, cross-bucket confirm, announcement, and refresh contract

M1 MUST render a `Pressable` reclassify trigger per transaction row (`testID="reclasificar-trigger-{transaccionId}"`). Activating it MUST open a full-screen `Modal` listing categorías grouped by `BUCKETS_ASIGNABLES` sections (Necesidades → Deseos → Ahorro — exactly 3 sections, no "Otros"). Selecting a categoría from the same bucket MUST commit immediately (no confirmation). Selecting a categoría from a different bucket MUST show `Alert.alert` with a title and a money-move body line naming the exact move (e.g. `"Esto mueve $X de Gustos a Necesidades."`, using `ETIQUETA_BUCKET` display labels on both source and destination, trailing period included), guarded by a `useRef` in-flight lock and `cancelable: false` (us-044 guard pattern). On confirmed success the screen MUST: (a) re-run `fetchDetalleBucketMes` for the current period, and (b) call `solicitarRecargaResumen()`. On a confirmed cross-bucket move the screen MUST call `AccessibilityInfo.announceForAccessibility('Movida a {ETIQUETA_BUCKET[bucketNuevo]}.')` AND render a screen-owned status `Text` with that same text — a `Text` element that is NOT inside the moved row's component and therefore survives the row's removal on refetch.

The exact pinned announcement string is: `'Movida a {ETIQUETA_BUCKET[bucketNuevo]}.'` — trailing period included. Example: a move to `Deseos` announces `'Movida a Gustos.'` (non-trivial: the display label, not the wire key).

Same-bucket reclassification MUST NOT produce an announcement or update the status region.

#### Scenario: Reclassify Modal opens with exactly 3 bucket sections (RNTL)

- GIVEN the reclassify trigger `Pressable` (`testID="reclasificar-trigger-{id}"`) is pressed
- WHEN the Modal opens
- THEN exactly 3 section headers are rendered: `"Necesidades"`, `"Gustos"` (display label for `Deseos`), and `"Ahorro"` — no "Otros" or Ingresos section

#### Scenario: Same-bucket reclassify commits without Alert (RNTL)

- GIVEN the Modal is open for a transaction currently in `Deseos`
- WHEN the user selects a `Deseos` categoría
- THEN `Alert.alert` is NOT called and the reclassify API call fires immediately

#### Scenario: Cross-bucket Alert carries the correct money-move copy using display labels (RNTL)

- GIVEN the Modal is open for a transaction currently in `Deseos` (shown as `"Gustos"`)
- WHEN the user selects a `Necesidades` categoría
- THEN `Alert.alert` is called with a message body containing `"Esto mueve $X de Gustos a Necesidades."` (trailing period included) — the `ETIQUETA_BUCKET` display labels on BOTH source and destination; a raw-key implementation (`"Esto mueve $X de Deseos a Necesidades."`) fails this scenario

#### Scenario: Confirming a cross-bucket move triggers refetch AND solicitarRecargaResumen (RNTL)

- GIVEN the cross-bucket `Alert.alert` is shown
- WHEN the user presses Confirm
- THEN the reclassify API call fires, and on success both `fetchDetalleBucketMes` AND `solicitarRecargaResumen` are called — asserted as spies on both functions

#### Scenario: Cross-bucket confirmation announces destination and updates the screen-owned status region (RNTL)

- GIVEN a cross-bucket move to `Deseos` has been confirmed and succeeded
- WHEN the refetch completes
- THEN `AccessibilityInfo.announceForAccessibility` was called with `'Movida a Gustos.'` (spy assertion — this is assertable in RNTL via spy; the screen-reader's actual announcement is Maestro/manual-only)
- AND a `Text` element with `testID="status-reclasificar"` contains `'Movida a Gustos.'` — this element is NOT inside any individual transaction row component

#### Scenario: Status region outlives the moved row (RNTL)

- GIVEN `testID="status-reclasificar"` shows `'Movida a Gustos.'` after a cross-bucket move
- WHEN `fetchDetalleBucketMes` refetches and the moved row is removed from the list
- THEN `testID="status-reclasificar"` still contains `'Movida a Gustos.'`

#### Scenario: Same-bucket reclassify does NOT trigger an announcement (RNTL)

- GIVEN a same-bucket move completes
- WHEN the screen updates
- THEN `AccessibilityInfo.announceForAccessibility` is NOT called
- AND `testID="status-reclasificar"` content is NOT updated

#### Scenario: Cancelling the cross-bucket Alert leaves the UI unchanged (RNTL)

- GIVEN the cross-bucket `Alert.alert` is shown
- WHEN the user presses Cancel
- THEN no reclassify API call is made and the transaction remains in its group

#### Scenario: A failed reclassify API call does not trigger the refresh contract (RNTL)

- GIVEN the cross-bucket move is confirmed
- WHEN the reclassify API call returns an error
- THEN neither `fetchDetalleBucketMes` nor `solicitarRecargaResumen` is called for the success path

---

### Requirement: MDET-06 — M2 route, header, and read-only income list

`app/ingresos.tsx` MUST register under `<Stack.Protected>` in `_layout.tsx`, manage the same three-tag state machine as MDET-01 — `loading`, `error`, and `data` — (no TanStack Query), with `empty` derived inside the `data` tag from `viewModel.filas.length === 0`. It MUST render: the `SelectorPeriodoMes` component (MDET-04), the title `"Ingresos"`, `conteoLabel`, `totalLabel` (CLP string-safe, from `dto.total`), and a static note indicating no meta/semáforo applies to this view. The income list MUST render each row as `Fecha · Descripción · Origen · Monto` with `Origen` displayed as a small badge/`Text`. Origen values are rendered bank-verbatim (server is the authority — no client-side normalization). M2 MUST NOT render any reclassify control, mutation trigger, or refresh signal (D-08, WDI-06 parity).

#### Scenario: M2 renders header with period selector and income totals (RNTL)

- GIVEN `fetchIngresosMes` resolves with `conteo: 5`, `total: "1500000"`, and a `transacciones` array
- WHEN the M2 screen renders
- THEN `"Ingresos"` title is visible, `SelectorPeriodoMes` renders with `"julio 2026"` label (from the local `periodo` state seeded as `"2026-07"`), and the formatted total `"+$1.500.000"` is visible

#### Scenario: Each income row shows its Origen badge (RNTL)

- GIVEN an income row with `origen: "Banco de Chile"` and `monto: "500000"`
- WHEN M2 renders that row
- THEN a `Text` with content `"Banco de Chile"` is visible alongside the formatted amount

#### Scenario: M2 renders no reclassify control (RNTL)

- GIVEN M2 has rendered its data state with at least one income row
- WHEN the screen is queried
- THEN no element with `testID` matching `"reclasificar-*"` exists anywhere in the tree

#### Scenario: Period arrow re-fetches M2 data for the new month (RNTL)

- GIVEN M2 is showing `"2026-07"` data
- WHEN the user presses `‹` on `SelectorPeriodoMes`
- THEN `fetchIngresosMes` is called with `periodo="2026-06"` and the screen re-renders with that period's data

---

### Requirement: MDET-07 — Domain purity, CLP safety, and test coverage contract

`aDetalleBucketMesViewModel` and `aIngresosMesViewModel` MUST be pure TypeScript functions in `apps/mobile/src/domain/` with no React Native import. Both view-models MUST format CLP amounts using only `formatearMontoCLP` / `formatearMontoConSigno` — never `parseFloat` or `Number()` on any amount string (MOB-05 discipline extended to this domain). `aDetalleBucketMesViewModel` produces a `bucket` field (the raw wire key) and NOT an `etiquetaBucket` field; `ETIQUETA_BUCKET` label resolution is the COMPONENT layer's responsibility. `aIngresosMesViewModel` reads `dto.total` (the real `IngresosMesResponse` field); M2 empty state = `viewModel.filas.length === 0`. `aFechaCorta` MUST be a pure function in `apps/mobile/src/domain/fecha-corta.ts`. The prev/next-month arithmetic helper MUST be a pure function covered by plain jest unit tests. Every string label produced by the view-models (porcentajeLabel, metaLabel, conteoLabel, totalLabel) MUST be pinned in at least one unit test so web↔mobile copy drift shows as an intentional edit (no `packages/shared`, ADR-008, R5).

#### Scenario: aDetalleBucketMesViewModel carries the raw bucket key (unit test)

- GIVEN `dto.bucket = "Deseos"` in the DetalleBucketMesDto
- WHEN `aDetalleBucketMesViewModel(dto)` is called
- THEN `result.bucket` equals `"Deseos"` — the raw wire key (the VM does NOT produce an `etiquetaBucket` field; display-label resolution via `ETIQUETA_BUCKET` happens at the COMPONENT layer)

#### Scenario: aDetalleBucketMesViewModel formats a CLP amount without parseFloat (unit test)

- GIVEN `dto.total = "9007199254740993"` (exceeds `Number.MAX_SAFE_INTEGER`)
- WHEN `aDetalleBucketMesViewModel(dto)` is called
- THEN `result.totalLabel` preserves all digits (no precision loss); `parseFloat`/`Number` on the amount would lose the last digit and fail this assertion

#### Scenario: aIngresosMesViewModel formats total as a signed CLP string (unit test)

- GIVEN `dto.total = "1500000"` (the real `IngresosMesResponse` field — `totalIngreso` does not exist in the contract)
- WHEN `aIngresosMesViewModel(dto, "2026-07")` is called
- THEN `result.totalLabel` equals `"+$1.500.000"` (signed via `formatearMontoConSigno`, web parity) or equivalent string-safe formatted output

#### Scenario: prev/next-month wraps correctly at year boundaries (unit test)

- GIVEN the prev-month helper with input `"2026-01"`
- WHEN called
- THEN it returns `"2025-12"` — no off-by-one or year-drop
