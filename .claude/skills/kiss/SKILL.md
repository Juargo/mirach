---
name: kiss
description: Al escribir o revisar código de MoneyDiary para reducir complejidad y mejorar legibilidad. Usar cuando se diga "simplifica esto", "muy complejo", "difícil de leer", "no entiendo este código", "límpialo". Para sobre-ingeniería ver yagni.
metadata:
  version: 1.0.0
---

# KISS — Keep It Simple — MoneyDiary

> Adaptado de [JordanCoin/codingskills](https://github.com/JordanCoin/codingskills) (MIT).

## Principio

Entre dos soluciones que producen el mismo resultado, preferir la más fácil de leer, entender y cambiar. El código se lee 10x más de lo que se escribe — y en este proyecto (equipo de uno + agentes) el lector futuro casi nunca es quien escribió.

## Reglas

1. **Optimizar para lectura.** Unas líneas más de código claro le ganan al one-liner que necesita comentario.
2. **Tecnología aburrida.** Preferir patrones ya establecidos en el repo (VO + use case + port + adapter; `Result<T,E>`) antes que introducir un patrón nuevo. Un patrón nuevo requiere justificación tipo ADR.
3. **Anidamiento ≤ 3 niveles.** Aplanar con early returns / guard clauses. El estilo del repo ya lo hace: validar y retornar `Result.fail(...)` temprano, lógica principal al nivel superior.
4. **Una función, un trabajo.** Si describes la función con "y", divídela.
5. **Nombres por lo que hacen:** `coincide()`, `formatearMontoCLP()`, `obtenerMovimientosMes` — no por cómo lo hacen.
6. **Sin trucos clever:** nada de regex ilegibles para parsear celdas, ni aritmética "ingeniosa" con dinero. El dinero usa `BigInt` y basis points **explícitos** (`porcentajeBp`, round-half-up documentado).
7. **Explícito sobre implícito:** enums (`BancoConocido`, `EstadoSemaforo`, `TipoColumna`) en lugar de strings sueltos; estados de ingesta con transiciones claras (`PENDIENTE → PROCESADA/FALLIDA`).

## Ejemplos del propio repo

- **Simple bien hecho:** el cliente HTTP mobile es un `fetchResumen` mínimo con 4 resultados mapeados — no un api-client genérico (eso es deuda consciente, ADR-012).
- **Complejidad que es correctitud, no exceso:** comparación timing-safe en `ApiKeyGuard`, guardas de overflow en `transaccion.mapper.ts`, `cell.text` en vez de `String(cell.value)` para richText de BCI. **No simplificar eso.**
- **Guard clauses:** los use cases retornan `Result.fail` al primer problema en lugar de anidar `if` positivos.

## Anti-patrones

- Funciones-dios que detectan + validan + normalizan (por algo el pipeline son 3 use cases).
- Optimización prematura sin medición (tensión con el fluir del sprint: primero correcto y claro).
- Comentarios que explican "qué" — si hacen falta, el código no es claro; los comentarios del repo explican "por qué" (decisiones, gotchas).
- Sistemas stringly-typed donde ya existen enums/VOs.

## Límites

- **Simple ≠ naive:** validación de entrada, manejo de errores con `Result`, y tipos exactos para dinero no son "complejidad" — son el corazón del dominio financiero (ADR-015: el riesgo se concentra en el dinero).
- **Dominio inherentemente complejo:** redondeo, signos ingreso/gasto y bandas del semáforo tienen complejidad irreducible — KISS significa no agregar complejidad *encima*, no recortar la esencial.
- **Tensión con DRY:** a veces duplicar 3 líneas es más simple que la abstracción.

## Checklist de review

- [ ] ¿Alguien nuevo entiende esta función sin preguntarle al autor?
- [ ] ¿Anidamiento ≤ 3? ¿Guard clauses con `Result.fail` temprano?
- [ ] ¿Hay atajos "clever" que ahorran líneas pero cuestan claridad?
- [ ] ¿Comentarios de "qué" que delatan código poco claro?
- [ ] ¿Se respetan los patrones existentes del repo en lugar de inventar uno nuevo?

## Skills relacionadas

- **yagni**: cuando la complejidad viene de construir lo que no se necesita aún
- **solid**: cuando la complejidad viene de mal diseño de módulos
- **dry**: cuando conviene tolerar duplicación pequeña en nombre de la claridad
