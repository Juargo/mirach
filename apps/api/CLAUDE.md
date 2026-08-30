# apps/api — Notas técnicas (gotchas)

Conocimiento no obvio del backend ya entregado — durable, no derivable de un vistazo. Arquitectura, convenciones y ADRs viven en el `CLAUDE.md` raíz y en `docs/adr/`.

- **Parseo Excel:** las strategies leen celdas con `cell.text`, **no** `String(cell.value)` — BCI usa `richText` y `.value` no lo resuelve. Cada strategy expone `getEstructura()` (fila de encabezados + columnas esperadas). Fechas aceptadas: `DD/MM/YYYY`, `YYYY-MM-DD`, `DD-MM-YYYY` (el último para Santander). Detección de banco por celda clave → ver "Patrones de detección bancaria".
- **Prisma:** `prisma.config.ts` (raíz de `apps/api/`) **NO** acepta `earlyAccess: true` (el tipo estable de Prisma 7 lo rechaza). El `CHECK cargo/abono ≥ 0` va por SQL puro en migración (`add_cargo_abono_check`) — Prisma no modela CHECK.
- **Dinero:** `BigInt` exacto en `cargo/abono`, nunca `float`; el mapper `number ↔ BigInt` (`transaccion.mapper.ts`) tiene guardas de overflow (`Number.MAX_SAFE_INTEGER`). Los porcentajes 50/30/20 se calculan en basis points con round-half-up (`resumen-mes.ts`). Los montos crudos se **scrubben** de los mensajes de error (dominio y boundary HTTP 400). DTOs BigInt-safe: montos como string.
- **Semáforo (`estado-semaforo.ts`):** umbrales en bp — Necesidades ≤50%, Deseos ≤30%, Ahorro en banda bidireccional 20–40%; `estadoGlobal` = peor estado entre los 3 buckets de gasto. El backend **calcula** el estado; el cliente solo lo renderiza (ADR-024).
- **Categorización:** `PatronClasificacion.coincide()` es case-insensitive con `CONTAINS`/`STARTS_WITH`/`REGEX` (REGEX en try/catch, nunca lanza). Regla Ingreso = `abono>0 && cargo===0`. El paso de categorización en `ProcessIngestaUseCase` es una **isla degradable**: si falla, deja las filas no-Ingreso en `null` (no `SinCategoria`) para reintento. Seed idempotente del catálogo chileno. Sin IA (RES-ALC-003).
- **Aislamiento multi-tenant (RNF-SEC-006):** todo repo que devuelve datos de usuario filtra por `userId` en el WHERE (p. ej. `account: { userId }`), **no** en memoria. `periodo` ausente → mes en curso; inválido → 400 con scrub.
- **db-safety:** las mutaciones destructivas de BD exigen opt-in `ALLOW_DESTRUCTIVE_DB=1` y rechazan connection strings de prod. El gate bloquea e2e/int contra Supabase (por eso necesitan una DB local; ver `apps/api/docs/local-test-db.md`).
- **Cifrado de columnas sensibles:** ver ADR-013 (`docs/adr/`).

## Patrones de detección bancaria

| Banco | Celda clave | Valor |
|-------|-------------|-------|
| BancoEstado | A1 | Contiene `"CuentaRUT"` |
| Banco de Chile | B8/B9/B10 | `"Sr(a):"` / `"Rut:"` / `"Cuenta:"` |
| Santander | A2 | Comienza con `"Cuenta Corriente:"` + contiene `"0-000-"` |
| BCI | A1 + A8 | `"Últimos Movimientos"` + `"Fecha Transacción"` |

## Fixtures de prueba

Los fixtures llevan sufijo `-test` y contienen datos anonimizados (los originales, con info sensible real, se eliminaron del repo).

```
apps/api/test/fixtures/
  Últimos_Movimientos_CuentaRUT_test.xlsx            ← BancoEstado ✅ detectado
  movimientos-test.xlsx                              ← BCI ✅ detectado
  ultimos movimientos-Cuenta Corriente-test.xlsx     ← Santander ✅ detectado
  cartola-test.xls     ← placeholder .xls (sin datos) — solo para el test de rechazo por extensión (ADR-007)
  pdf/                 ← cartolas PDF de prueba (ADR-009, pdfjs-dist), al menos una por banco:
    bancochile-cartola-test.pdf · bancoestado-cartola-test.pdf · bci-cartola-test.pdf · santander-cartola-test.pdf
    bci-cartola-montos-grandes-test.pdf ← 2ª cartola BCI sintética (recalibración rangosX 2026-08-30): cargos/abonos anchos right-aligned, fila $0 literal, sección de totales; se regenera con generar-bci-cartola-montos-grandes-test.ts (mismo directorio)
```
