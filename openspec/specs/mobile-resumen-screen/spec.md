# Mobile Resumen Screen Specification

## Purpose

Defines the read-only Expo screen (`apps/mobile`) that renders `GET /api/resumen` — income, 50/30/20 buckets, and semáforo — with BigInt-safe money formatting (ADR-015 money emphasis) and the loading/empty/error/data states the Maestro flow asserts against.

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

### Requirement: MOB-03 — Screen renders four explicit states

The screen MUST render exactly one of: loading, empty (`sinIngreso: true`), error, or data — and MUST NOT render partial/undefined content while transitioning.

#### Scenario: Loading state while the request is in flight

- GIVEN the screen has just mounted
- WHEN the resumen request has not yet resolved
- THEN a loading indicator is shown
- AND no bucket data or error copy is shown

#### Scenario: Empty state when there is no income

- GIVEN the API responds 200 with `sinIngreso: true`
- WHEN the screen renders the response
- THEN an empty-state message distinct from "0%" is shown
- AND per-bucket `porcentajeBp: null` is NOT rendered as "0%"

#### Scenario: Error state on any mapped failure

- GIVEN the client produced a typed error state (401, network, or parse — MOB-02)
- WHEN the screen renders that state
- THEN error copy appropriate to the failure type is shown
- AND no stale/partial bucket data is shown

#### Scenario: Data state renders income, buckets, and semáforo

- GIVEN the API responds 200 with `sinIngreso: false` and 4 buckets
- WHEN the screen renders the response
- THEN `totalIngreso` is shown formatted as CLP
- AND each of Necesidades, Deseos, Ahorro, SinCategoria shows its `total` (CLP) and `porcentajeBp` (formatted as a percentage, or omitted/distinct when null)
- AND each bucket's `estadoSemaforo` ('verde'|'amarillo'|'rojo'|null) is rendered as a distinct visual indicator
- AND the global semáforo (`estadoGlobal`) is rendered with `testID: "semaforo-global"`

### Requirement: MOB-04 — Screen satisfies the Maestro contract independent of login

The screen MUST expose the text "Distribución 50/30/20", the literal bucket names "Necesidades", "Deseos", "Ahorro", and an element with `testID: "semaforo-global"`, reachable without any login flow.

#### Scenario: Maestro assertions pass without running login.yaml

- GIVEN the app is launched fresh (no login flow exists)
- WHEN `resumen-semaforo.yaml` runs
- THEN "Distribución 50/30/20" is visible
- AND "Necesidades", "Deseos", "Ahorro" are each visible
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
