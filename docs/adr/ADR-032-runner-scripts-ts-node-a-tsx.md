---
tags:
  - adr
  - fase-diseño
  - infraestructura
  - tooling
proyecto: MoneyDiary
estado: ✅ Decidido
fecha_creacion: 2026-08-03
fecha_actualizacion: 2026-08-03
---

# ADR-032 — Runner de scripts TypeScript: `ts-node` → `tsx`

## Estado

✅ **Decidido** — se adopta **`tsx`** como único runner para ejecutar TypeScript sin compilar previamente (dev server, CLI, seed, scripts one-off), reemplazando a **`ts-node`**. Se eliminan `ts-node` y `tsconfig-paths` de las dependencias.

✅ **Implementado** — en el mismo PR que introduce este ADR (convención del repo: los ADR se revisan en el PR que los implementa). Alcance: solo `apps/api`.

---

## Contexto

`apps/api` ejecuta TypeScript sin build previo en varios puntos: el dev server (`start`), la CLI de ingesta (`cli`), el seed de Prisma (`test:db:seed`), y scripts one-off (`env:example`, `openapi:emit`, `dast:token`, backfills). Hasta hoy todos usaban **`ts-node`**.

Tres hechos que motivan revisar la elección:

1. **`ts-node` nunca fue una decisión — fue herencia.** Entró en el commit `9bc33af` ("convert to pnpm monorepo") junto con el stack original NestJS, que trae `ts-node` de fábrica. La migración a Express (ADR-028 Migración Backend a Express) lo dejó pasar por inercia, igual que `nest-cli.json` y los flags de decoradores (removidos aparte). **No existe ningún ADR que lo justifique.** La única mención en la doc era una regla de consistencia en un runbook ("el repo usa `ts-node`, no `tsx`") que dicta la norma pero no da razón técnica.

2. **`ts-node@10` se rompe con TypeScript 7.** El runner accede a APIs internas del compilador (`ts.sys`) que el port nativo de TS 7 reorganizó; falla con `TypeError: Cannot read properties of undefined (reading 'fileExists')`. Esto lo ata a TS 5.x y lo convierte en un bloqueante para cualquier adopción futura de TS 7.

3. **`tsconfig-paths`, `baseUrl` y el bloque `ts-node` del tsconfig son inertes o innecesarios.** No hay `paths` ni aliases en el tsconfig, así que `-r tsconfig-paths/register` no resuelve nada; `baseUrl` es su gemelo de resolución de módulos, igualmente inerte sin `paths`. El bloque `"ts-node": { "files": true }` existía solo porque `ts-node` type-chequea al arrancar y necesitaba cargar el `.d.ts` ambient de `req.userId`; un runner que solo transpila no lo necesita.

## Decisión

Adoptar **`tsx`** como runner único de TypeScript en `apps/api`:

- Reemplazar `ts-node` por `tsx` en los 8 scripts de `package.json` y en el `seed` de `prisma.config.ts`.
- Quitar el flag `-r tsconfig-paths/register` (`tsx` resuelve `paths` de forma nativa y, además, no hay `paths` que resolver).
- Remover las dependencias `ts-node` y `tsconfig-paths`.
- Eliminar el bloque `"ts-node"` de `tsconfig.json` (obsoleto: `tsx` no type-chequea, no puede fallar con `TS2339`) y la opción inerte `baseUrl`. El `.d.ts` ambient se conserva — sigue siendo necesario para el type-check real (`tsc --noEmit`).

### Por qué `tsx`

| Criterio | `ts-node` | `tsx` |
|---|---|---|
| Motor | compilador TS (lento) | esbuild (rápido) |
| Configuración | knobs, fricción con ESM/`nodenext` | zero-config |
| `paths` de tsconfig | vía `-r tsconfig-paths` | nativo |
| Compatibilidad TS 7 | ❌ (usa internals) | ✅ (independiente de la versión de TS) |
| Mantenimiento | ralentizado | activo |

Punto clave: **ninguno de los dos aporta type-check confiable al ejecutar** — ambos transpilan y corren. El type-check del proyecto lo hace `tsc --noEmit` en CI (gate independiente). Por lo tanto `ts-node` no ofrecía ninguna garantía que `tsx` no dé, y sí arrastraba lentitud, config y el bloqueo de TS 7.

## Alternativas consideradas

- **Mantener `ts-node`** — rechazada: incompatible con TS 7, mantenimiento estancado, y es un default heredado sin justificación, no una elección.
- **`node --experimental-strip-types`** — rechazada por ahora: sigue marcado como experimental, sin watch ergonómico ni resolución de `paths`, y menos práctico para los 8 scripts. Reevaluable cuando se estabilice.
- **Bun / Deno** — rechazada: cambiar de runtime excede el alcance (el proyecto corre sobre Node, ADR-004 Hosting) y no aporta al problema puntual del runner de scripts.

## Consecuencias

- **Producción no cambia.** `start:prod` ya era `node dist/...` (build compilado, sin runner de TS). Esta decisión solo afecta dev y scripts.
- **Se destraba TS 7 a futuro.** `tsx` es independiente de la versión de TypeScript; el día que el resto del ecosistema (typescript-eslint, etc.) soporte TS 7, el runner deja de ser bloqueante.
- **Menos dependencias y config.** Salen `ts-node`, `tsconfig-paths` y el bloque `"ts-node"` del tsconfig.
- **El type-check no se debilita.** Sigue viviendo en `tsc --noEmit` (CI), donde siempre estuvo el gate real.
- **Doc actualizada.** El runbook `docs/us-013-...` invierte su regla ("usar `tsx`, no `ts-node`") para no contradecir la realidad.
