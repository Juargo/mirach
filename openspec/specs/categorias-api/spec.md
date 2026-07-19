# Categorías API Specification (apps/api — infrastructure/http)

## Purpose

HTTP contract for reading a transaction's categoría and manually
reclassifying it. Covers the write endpoint's `userId` isolation, the
resulting 50/30/20 resumen recompute when a reclassify crosses a bucket, and
the `categoria` field exposed on movimientos/detalle-bucket DTOs. Builds on
the invariant defined in `categorias-model`.

Shipped contract: `PATCH /api/transacciones/:id/categoria`, guarded by the
same `ApiKeyGuard` + `SessionGuard` chain as the other data controllers. The
request body carries the categoría's domain `nombre` (e.g. `"Transporte"`),
not its physical id — the backend derives both `categoriaId` and the
resulting `bucketId` server-side; a client can never submit a bucket
directly.

## Requirements

### Requirement: CATAPI-01 — Reclassify endpoint is `userId`-isolated

A write endpoint MUST let the authenticated user set a categoría on ONE of
their OWN transactions. It MUST reject the request when the target
transaction does not belong to the caller's `userId` (RNF-SEC-006), returning
an error that reveals no data about the other user's transaction (not-found
and not-owned MUST be indistinguishable to the caller).

#### Scenario: A user cannot reclassify another user's transaction

- GIVEN transaction T belongs to user B
- WHEN user A's session calls the reclassify endpoint for T
- THEN the request fails with 404 and T's `categoriaId`/`bucketId` are
  unchanged

#### Scenario: A user can reclassify their own transaction

- GIVEN transaction T belongs to user A
- WHEN user A's session calls the reclassify endpoint with a valid categoría
  `nombre`
- THEN T's `categoriaId` updates and the response reflects the new value

### Requirement: CATAPI-02 — Reclassify rejects an unknown categoría

The endpoint MUST validate the target categoría `nombre` against the fixed
taxonomy (`categorias-model` CAT-04) before applying the change; an unknown
value MUST be rejected without mutating the transaction, and the rejected
value MUST NOT be reflected back in the error message.

#### Scenario: Unknown categoría name is rejected

- GIVEN a categoría `nombre` that does not exist in the catalog
- WHEN the reclassify endpoint is called with it
- THEN the request fails with 400 and the transaction is unchanged

### Requirement: CATAPI-03 — Within-bucket reclassify changes categoría only

Reclassifying to a categoría of the SAME bucket MUST update `categoriaId` and
MUST leave `bucketId` and the period's resumen bucket totals unchanged.

#### Scenario: Reclassify Delivery → Streaming keeps Deseos totals unchanged

- GIVEN a transaction currently categoría "Delivery" (bucket Deseos)
- WHEN it is reclassified to "Streaming" (also bucket Deseos)
- THEN `bucketId` stays Deseos and the resumen's Deseos subtotal is unchanged

### Requirement: CATAPI-04 — Cross-bucket reclassify moves money and recomputes the resumen exactly

Reclassifying to a categoría of a DIFFERENT bucket MUST update both
`categoriaId` and `bucketId` atomically (single-row write — the derived
`bucketId` cache can never be left half-updated), and the period's 50/30/20
resumen (bucket totals, `porcentajeBp`, `estadoSemaforo`) MUST reflect the
move on the next read. All amounts MUST remain exact (`BigInt`/integer minor
units) — no `float` rounding. The resumen is computed on read (no
server-side materialized cache); the client is responsible for refetching
after a successful reclassify.

#### Scenario: Moving a transaction from Deseos to Necesidades shifts both bucket totals

- GIVEN a $10.000 transaction currently categoría "Delivery" (Deseos)
- WHEN it is reclassified to "Transporte" (Necesidades)
- THEN the resumen's Deseos subtotal decreases by exactly $10.000 and
  Necesidades increases by exactly $10.000, with no precision loss

#### Scenario: A cross-bucket reclassify can flip the traffic-light state

- GIVEN a period whose Necesidades `estadoSemaforo` is Verde at exactly the
  50% threshold
- WHEN a reclassify pushes Necesidades over 50%
- THEN the recomputed resumen reflects the new (non-Verde) state

### Requirement: CATAPI-05 — Movimientos/detalle-bucket DTOs expose categoría

`GET /api/movimientos` and `GET /api/buckets/:bucket` row shapes MUST include
a `categoria` field (`{ id, nombre } | null`). It MUST be `null` for Ingreso
and SinCategoria rows (and any unmatched row), and the categoría's own
`{id, nombre}` otherwise. This is additive — existing fields (`bucket`, money
strings) are unchanged.

#### Scenario: A classified row exposes its categoría

- GIVEN a transaction with categoría "Supermercado"
- WHEN the movimientos endpoint is called
- THEN the row's `categoria` field is `{ id: <id>, nombre: "Supermercado" }`

#### Scenario: Ingreso and SinCategoria rows expose null categoría

- GIVEN one Ingreso row and one SinCategoria row in the period
- WHEN the movimientos endpoint is called
- THEN both rows' `categoria` field is `null`

## Non-Goals

- User-created custom categorías via the API.
- Bulk/batch reclassify endpoint (single transaction per call only).
- Pagination changes to movimientos/detalle-bucket.
