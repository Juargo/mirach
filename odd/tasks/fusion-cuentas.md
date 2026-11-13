# Merge an anonymous account into an existing account (ADR-013 delivery 2)

Objective: a person who used the app without an account and then enters an account that already exists gets the data of the device merged into that account. Branch: `feat/fusion-cuentas`. Delivery: API (with ADR-014 and both regenerated clients) first, iOS stacked on it; PRs opened only when the user asks. Runners: API `pnpm api test`, `pnpm api exec tsc --noEmit`, `pnpm api lint`, `pnpm api openapi:check`, `pnpm api build`; iOS `xcodebuild ... -only-testing:MirachTests test`.

## Specs

- **S1** The user's decision (2026-11-12). To "cuando alguien vincula y esa cuenta de Apple o Google ya existe, ¿preferís cambiar a la cuenta existente descartando lo anónimo (con aviso), o fusionar los datos?": "fusionar". Delivery 1 (`odd/tasks/cuenta-anonima.md`) left the anonymous session parked in a separate Keychain item; this delivery recovers its data.
- **S2** API `POST /api/cuenta/fusionar`, behind the session. The destination is always the session user. Body `{ tokenOrigen }`: the session token of the anonymous account, which proves the caller owns it.
  - `200` with the counts `{ cuentasMovidas, cuentasUnidas, movimientosMovidos, duplicadosOmitidos, categoriasMovidas, patronesMovidos }`.
  - `409 ORIGEN_INVALIDO` when the origin token is unknown or expired, when its account is not anonymous, or when it is the destination itself. One code for all of them. Never `401` for a bad origin token (a `401` on a session route signs the person out).
  - `409 DESTINO_ANONIMO` when the session user is itself anonymous.
  - `400 BODY_INVALIDO` for a missing or malformed body. `429` over the per-IP budget (30 per 15 minutes, released on success).
  - Nothing is written on any rejection.
- **S3** Merge rules. Everything happens in one database transaction: all or nothing.
  - (a) Bank accounts: an origin account with the same `(banco, tipoCuenta, numeroCuentaBlindIndex)` as a destination account is united with it; any other origin account is moved. The placeholder account of manual movements follows the same rule.
  - (b) Movements of a united account: the duplicate rule of the ingest (`fecha|cargo|abono|descripcion` in plain text, counting copies). An origin movement that already exists in the destination account is dropped and counted in `duplicadosOmitidos`; the others are moved keeping their category, bucket, `clasificacionManual`, `origen` and `ingestaId`.
  - (c) Ingestas move to the destination (`userId`, and `accountId` for a united account). Their stored totals are not recomputed.
  - (d) Categories: an origin category with the same `(bucketId, nombre)` as a destination category is replaced by it (its movements and patterns are re-pointed first, then it is removed; the destination's icon stays). Any other origin category is moved with its patterns.
  - (e) Patterns: an origin pattern whose text already exists among the destination's patterns, with the same folding the pattern creation uses, is dropped; the others are moved.
  - (f) The destination keeps its own name, email, budget profile, goals, cut day, declared income and consents. The origin's are discarded.
  - (g) The origin's sessions are deleted and the origin user is deleted. A second call with the same token answers `409 ORIGEN_INVALIDO`.
  - (h) No row of any other user is read or written; a movement never ends up pointing to a category of another user.
- **S4** iOS.
  - The `CUENTA_YA_EXISTE` confirmation changes its body to "Si entras a ella, uniremos los datos de este dispositivo con los de esa cuenta." and its buttons to "Entrar y unir datos" and "Cancelar". After entering the account the app calls the merge with the parked token. Success: the parked item is cleared and Perfil shows "Datos de este dispositivo unidos a tu cuenta". Failure: the parked item is kept and Perfil shows "No pudimos unir los datos de este dispositivo. Puedes intentarlo de nuevo desde Perfil."
  - Perfil, for a session that is not anonymous while a parked anonymous session exists: a section "Datos de este dispositivo" with the text "Tienes datos guardados de cuando usaste la app sin cuenta." and the action "Unir a mi cuenta", with the same success and failure messages. On `409 ORIGEN_INVALIDO` the parked item is cleared and the message is "Esos datos ya no están disponibles."
  - The app never merges without that explicit action of the person.
  - The two link buttons of Perfil keep their own accessibility identifiers (`perfil.link.apple`, `perfil.link.google`); today the section's identifier overrides them.
  - Assumption: the strings were chosen by the orchestrator and can be changed by the user.
- **S5** ADR-014 records the merge rules and amends ADR-013 §5. The contract change is additive and the API PR carries both regenerated clients (iOS and Android), or their drift checks fail.

## Tasks

| ID | Specs | Route | Status | Commit |
|----|-------|-------|--------|--------|
| T1 ADR-014 and index | S5 | inline | pending | |
| T2 API merge | S2, S3, S5 | delegated (Writer trigger b: long-session context backstop) | pending | |
| T3 iOS merge flow | S4 | delegated (same reason; depends on T2's contract, so after it) | pending | |

Risk: item 1 (moves and deletes stored data, irreversible), item 2 (an endpoint that transfers data between two users). Independent verifier after T2.

## Log

- **L1** (2026-11-12) The user's request, verbatim: to "¿Sigo con la segunda entrega?" the user answered "si, sigue con la segunda entrega".
- **L2** Map from a read-only exploration (evidence by path): `Transaccion` has no `userId` (ownership is `account.userId`) and its `categoriaId` FK is single-column with ON DELETE SET NULL, so re-pointing must precede every delete. `PatronClasificacion(categoriaId, userId)` references `Categoria(id, userId)` ON UPDATE CASCADE. The blind-index key has no per-user salt, so `numeroCuentaBlindIndex` is comparable across users. The ingest duplicate key is built by `domain/value-objects/clave-duplicado.ts` and counted by `application/use-cases/marcar-duplicados.helper.ts`, in memory after decrypting `descripcion`. Pattern text uniqueness exists only in the application (`prisma-patron.repository.ts` `buscarPorTexto`). `PrismaCuentaRepository.eliminar` deletes session, consentimiento, transaccion, ingesta, patronClasificacion, categoria, account, user, in that order. `FREE_PLAN_MAX_BANKS` and `FREE_PLAN_CURRENT_MONTH_ONLY` are only exposed by `GET /api/config`, never enforced, so the merge has no plan rule to apply. iOS: `saveAnonymousBackup`, `loadAnonymousBackup`, `clearAnonymousBackup` in `Core/Session`; `PerfilViewModel.enterExistingAccount()` parks the session and switches account.
