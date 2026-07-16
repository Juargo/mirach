---
name: dry
description: Al escribir o revisar código para eliminar conocimiento y lógica de negocio duplicados en MoneyDiary. Usar cuando se diga "esto está duplicado", "lo tenemos en dos lugares", "fuente única de verdad", "DRY", o cuando un cambio de regla de negocio requiera tocar muchos archivos.
metadata:
  version: 1.0.0
---

# DRY — Don't Repeat Yourself — MoneyDiary

> Adaptado de [JordanCoin/codingskills](https://github.com/JordanCoin/codingskills) (MIT).

## Principio

Cada pieza de **conocimiento** del sistema debe tener una única representación autoritativa. DRY es sobre conocimiento duplicado (la misma regla de negocio en dos lugares), **no** sobre código que se parece.

## Fuentes únicas de verdad ya establecidas en el repo

| Conocimiento | Fuente única |
|--------------|--------------|
| Estructura esperada de cada banco | `getEstructura()` de su strategy (`infrastructure/excel/strategies/`) |
| Regla Ingreso (`abono>0 && cargo===0`) y match por prioridad | `categorizar-transaccion.use-case.ts` |
| Umbrales del semáforo 50/30/20 (bp) | `estado-semaforo.ts` (VO) |
| Formato/aritmética de dinero | `BigInt` + `transaccion.mapper.ts` (guardas de overflow) — jamás `float` |
| Catálogo de clasificación chileno | seed idempotente (`persistence/`) |
| Contrato HTTP | DTOs de los controllers (montos como string) |
| DoD/DoR y proceso | vault Obsidian `00 Metodología/` |

Si tocas una de estas reglas y el cambio requiere editar más de un lugar, hay duplicación que corregir.

## Excepción deliberada (NO "arreglarla")

**Los tipos DTO se escriben a mano en cada cliente** (`apps/web/src/api/types.ts`, `apps/mobile/src/domain/resumen.types.ts`) y **no existe `packages/shared`** — decisión de ADR-008 para no acoplar deploys ni romper ADR-005. Es duplicación *a través de un límite* aceptada conscientemente. El camino sancionado para eliminarla es **generación desde `openapi.json`** (ADR-011/012), no una librería compartida escrita a mano.

## Reglas

1. **Distinguir conocimiento de coincidencia.** Dos validaciones que hoy se parecen pero responden a reglas de negocio distintas (ej: banda de Ahorro 20–40% vs techo de Necesidades ≤50%) deben quedar separadas — van a divergir.
2. **Extraer cuando el patrón es estable** (regla de los 3 strikes, ver `yagni`). La primera vez escribe; la segunda anota; la tercera extrae.
3. **Sin magic strings/números repetidos:** umbrales en bp, estados de ingesta (`PENDIENTE/PROCESADA/FALLIDA`), nombres de bucket — siempre enums/constantes/VOs.
4. **Centralizar reglas transversales de seguridad:** el scrub de montos crudos en mensajes de error existe en el pipeline y en el boundary HTTP — cualquier scrub nuevo debe reutilizar esa utilidad, no reimplementarse.
5. **Generar antes que sincronizar a mano** cuando dos representaciones deban coincidir (ej: futuro `openapi.json` → tipos de cliente).

## Anti-patrones

- **Shotgun surgery:** cambiar un umbral del semáforo requiere tocar N archivos.
- **Copy-paste-modify** de una strategy de banco en lugar de parametrizar `EstructuraBanco`.
- **Docs que repiten código:** comentarios que parafrasean la implementación (derivan y mienten — caso real: docstrings stale de auth corregidos en PR #35).

## Límites

- **DRY prematuro crea la abstracción equivocada** — peor que la duplicación, porque otros crecen dependiendo de ella.
- **Tensión con KISS:** si la función unificada necesita 5 parámetros y 3 flags, la duplicación era más simple.
- **DRY entre límites tiene costo alto:** ver la excepción deliberada de los DTOs.

## Checklist de review

- [ ] ¿Este cambio duplica una regla de negocio que ya vive en la tabla de fuentes únicas?
- [ ] ¿Hay magic strings/números que deberían ser enum/constante/VO?
- [ ] Si esta regla cambia mañana, ¿cuántos archivos hay que editar? (respuesta correcta: 1)
- [ ] ¿Se está "unificando" código que representa conceptos distintos? (DRY equivocado)
- [ ] ¿Se está creando un shared entre workspaces? (prohibido por ADR-008 — usar generación, ADR-011)

## Skills relacionadas

- **yagni**: cuándo extraer (esperar 3 ocurrencias)
- **kiss**: cuando la abstracción DRY es más difícil de seguir que la duplicación
- **solid**: dónde debe vivir la regla centralizada (capa correcta)
