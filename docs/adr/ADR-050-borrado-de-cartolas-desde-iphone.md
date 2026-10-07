---
tags:
  - adr
  - fase-diseño
  - mobile
  - ios
proyecto: Mirach
estado: ✅ Decidido
fecha_creacion: 2026-10-06
fecha_actualizacion: 2026-10-06
---

# ADR-050 — Deleting an uploaded statement from the iPhone app

## Estado

✅ **Decidido** (2026-10-06, product owner) — plan phase 7, task T9 ("Cartolas subidas"). **Supersedes
only the words "borrar ingestas" in rule 2 of ADR-038's Decisión** (the list of writes excluded from
mobile). The rest of ADR-038 remains in force, as amended by ADR-044.

## Contexto

ADR-038 (MoneyDiary, 2026-08) kept mobile writes to the user's own profile and classification catalog,
and explicitly excluded "reclasificar transacciones, editar montos, borrar ingestas". At the time the web
app existed and was where a mistaken import was undone (`DELETE /api/ingestas/{id}`, US-018). ADR-044
later allowed reclassifying transactions on mobile and kept "borrar ingestas" excluded.

Mirach changed the premise: the web client is dormant (ADR-046), and the iPhone app is the only client.
The screen catalog written for Mirach (`docs/catalogo/pantallas/cartolas-subidas.md`) defines deleting an
uploaded statement as "the only way to undo a mistaken import". With the exclusion in force, a user who
imports the wrong file, the wrong account or the same period twice under another name has no way to fix it.

## Decisión

1. The iPhone app may delete an uploaded statement (`DELETE /api/ingestas/{id}`), which cascade-deletes
   its transactions on the server. No new endpoint and no change to the API: the endpoint already
   enforces session and per-user isolation (RNF-SEC-006).
2. Deleting always requires an explicit confirmation that states the consequence: for a processed
   statement, "Se eliminarán {N} movimientos de {banco} ({fecha}). Esta acción no se puede deshacer."; for a
   failed one, "Se eliminará esta cartola fallida de {banco} ({fecha})." One statement at a time, no undo
   window (the deletion is immediate on the server).
3. After a deletion the app refreshes the screens that show money (Resumen and details) so no stale totals
   remain.

## Consecuencias

- A mistaken import can be undone from the phone; the cost is a destructive action in the app, mitigated by
  the mandatory confirmation with the explicit consequence.
- Still excluded on mobile: editing amounts, and deleting individual transactions (ADR-040 keeps
  `DELETE /api/movimientos/:id` for manual rows, web only; Mirach has no manual-movement screen in v1).
- When an Android client is built, it inherits this scope.

## Alternativas consideradas

- **Keep the exclusion (read-only list).** Faithful to ADR-038, but with no web client there would be no
  way at all to undo a wrong import.
- **Undo window or bulk deletion like the old web app.** More complex for a first version; the catalog
  chose one-at-a-time with confirmation.
