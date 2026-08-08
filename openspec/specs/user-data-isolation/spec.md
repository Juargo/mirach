# User Data Isolation Specification

## Purpose

Defines that the 4 data-bearing endpoints (`resumen`, `movimientos`, `detalle-bucket`, `ingesta`) derive `userId` from the authenticated session — replacing the previously hardcoded `USER_ID_FIJO_TOKEN` — and that a user can never read another user's data (RNF-SEC-006, ADR-015). This holds regardless of which client is calling (web with a cookie session, or mobile with a Bearer session) — there is no keyless or session-less fallback for any of the 4 endpoints, including `/api/resumen` as consumed by `apps/mobile`.

## Requirements

### Requirement: ISO-01 — `userId` is derived from the session, not a fixed constant, for every client

(Previously: web-implicit. Revised: explicitly no keyless fallback for `/api/resumen` now that mobile authenticates via session too.)

Each of the 4 controllers (`resumen`, `movimientos`, `detalle-bucket`, `ingesta`) MUST resolve `userId` from the request's validated session (as exposed by `SessionGuard`, from either the cookie or `Authorization: Bearer` transport). None of them MUST inject or fall back to a hardcoded user id, and none MUST accept `x-api-key` alone as sufficient identity — a valid session is required on top of it, for both web and mobile callers.

#### Scenario: Data endpoint uses the session's userId

- GIVEN a user is logged in with a valid session
- WHEN they call any of the 4 data endpoints
- THEN the data returned belongs to the session's `userId`, not to any hardcoded constant

#### Scenario: Mobile `/api/resumen` call has no keyless fallback

- GIVEN the mobile app has a valid `x-api-key` but no stored session token
- WHEN it calls `GET /api/resumen`
- THEN the response status is 401
- AND no data is returned under a fallback/default `userId`

### Requirement: ISO-02 — Cross-user isolation across all 4 data endpoints, for both clients

A user authenticated as A MUST NOT be able to read data belonging to user B through any of the 4 data endpoints, regardless of request parameters or transport (cookie or Bearer).

#### Scenario: User A cannot read user B's resumen (web cookie session)

- GIVEN two seeded users A and B, each with their own transactions for the same period
- WHEN a client logged in as A calls `GET /api/resumen?periodo=<period>`
- THEN the response contains only A's data
- AND no field of the response reflects B's amounts or buckets

#### Scenario: User A cannot read user B's resumen (mobile Bearer session)

- GIVEN two seeded users A and B, each with their own transactions for the same period
- WHEN the mobile app authenticated as A (via `Authorization: Bearer`) calls `GET /api/resumen?periodo=<period>`
- THEN the response contains only A's data, identically to the web-cookie case

#### Scenario: User A cannot read user B's movimientos

- GIVEN two seeded users A and B, each with their own transactions for the same period
- WHEN a client logged in as A calls `GET /api/movimientos?periodo=<period>`
- THEN only A's transactions are returned

#### Scenario: User A cannot read user B's bucket detail

- GIVEN two seeded users A and B with transactions in the same bucket
- WHEN a client logged in as A calls the bucket-detail endpoint for that bucket
- THEN only A's transactions for that bucket are returned

#### Scenario: User A cannot trigger or read user B's ingesta

- GIVEN two seeded users A and B
- WHEN a client logged in as A calls the ingesta endpoint
- THEN any created/read ingesta record is scoped to A, and B's ingesta records are never returned to A
