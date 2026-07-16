---
name: yagni
description: Al escribir o revisar código de MoneyDiary para prevenir sobre-ingeniería y features especulativas. Usar cuando se diga "¿está sobre-ingenierizado?", "¿necesitamos esto?", "¿debería agregar...?", "future-proof", "por si acaso". Para simplicidad ver kiss.
metadata:
  version: 1.0.0
---

# YAGNI — You Aren't Gonna Need It — MoneyDiary

> Adaptado de [JordanCoin/codingskills](https://github.com/JordanCoin/codingskills) (MIT).

## Principio

No construir para requisitos hipotéticos. Construir lo que se necesita **ahora** y refactorizar cuando el requisito real aparezca. La generalización prematura es peor que la duplicación: la duplicación es obvia y barata de arreglar; la abstracción equivocada es cara de deshacer.

## YAGNI ya aplicado en este repo (precedentes a imitar)

- **Mono-usuario fijo** antes de auth multi-usuario/JWT (Tarea 0 Sprint 2) — el aislamiento por `userId` quedó estructural, pero sin construir todo el sistema de usuarios.
- **`ApiKeyGuard` compartida** en lugar de OAuth/JWT para el MVP mobile — mínimo que protege datos financieros hoy.
- **Mobile solo-lectura:** sin ingesta desde el teléfono, sin selector de período — cupo en un sprint.
- **Cliente HTTP mínimo** en mobile; `@moneydiary/api-client` formal (ADR-012) es deuda registrada, no se construyó "por adelantado".
- **Sin `packages/shared`** (ADR-008): dos archivos de tipos a mano en vez de infraestructura de librería compartida.
- **`NoOpCryptoService`:** el *port* existe (eso es diseño barato, no especulación), la implementación real espera su gatillo (riesgo aceptado con trigger documentado en el runbook).

Este patrón de decisión — mínimo hoy + deuda **registrada** con gatillo explícito — es la forma sancionada de aplicar YAGNI aquí.

## Reglas

1. **Resolver el problema al frente.** Un caso de uso = código para un caso de uso.
2. **Tres strikes, luego abstraer.** 1ª vez: escribe. 2ª: anota la duplicación. 3ª: extrae con datos reales de la forma correcta.
3. **Borrar caminos muertos:** parámetros que solo reciben el default, flags nunca toggled, columnas "que podríamos necesitar".
4. **Nada de plugin systems con un solo plugin.** Excepción calibrada: las strategies de banco se justifican porque hay **4 implementaciones reales** desde el día uno.
5. **Deuda consciente > feature especulativa:** si algo se difiere, se registra (backlog/ADR/runbook) con su gatillo — no se implementa a medias "por si acaso".

## Anti-patrones (con olor local)

- Agregar campos al schema Prisma "para el futuro" (cada columna nueva es migración + mapper + tests).
- Construir el selector de período histórico en mobile cuando la US pide mes en curso.
- Cachear `/api/resumen` sin haber medido un problema de latencia real.
- Parametrizar una strategy de banco para formatos que ningún banco chileno emite.
- Un event bus entre use cases que hoy se llaman directo en `ProcessIngestaUseCase`.

## Límites

- **YAGNI no aplica a la arquitectura:** las capas, los ports y `Result<T,E>` abaratan el cambio futuro — son estructura, no especulación.
- **YAGNI no aplica al manejo de errores conocidos:** archivo malformado, banco no reconocido, red caída en mobile — eso **va** a pasar en producción.
- **YAGNI no aplica a seguridad base:** fail-closed, scrub de montos, aislamiento por `userId` no son especulativos (ADR-015/021).
- **Extensibilidad a costo cero, tómala:** un map en vez de un switch, un enum en vez de strings.
- **Tensión con DRY:** mejor dos funciones parecidas que la unificación prematura equivocada.

## Checklist de review

- [ ] ¿Hay caminos de código que ningún requisito actual ejercita?
- [ ] ¿Parámetros/configs/flags con un solo valor posible hoy?
- [ ] ¿Esta interfaz se justifica con implementaciones concretas múltiples (o con el límite de capa)?
- [ ] Si se difiere algo, ¿quedó registrado con gatillo explícito (estilo 11.6)?
- [ ] ¿Funcionaría un enfoque más simple para el alcance actual?

## Skills relacionadas

- **kiss**: cuando el problema es complejidad, no especulación
- **solid**: para abstracciones que sí se justifican
- **dry**: cuándo extraer un patrón (esperar 3 ocurrencias)
