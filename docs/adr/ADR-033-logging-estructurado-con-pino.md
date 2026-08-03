---
tags:
  - adr
  - fase-diseño
  - infraestructura
  - observabilidad
proyecto: MoneyDiary
estado: ✅ Decidido
fecha_creacion: 2026-08-03
fecha_actualizacion: 2026-08-03
---

# ADR-033 — Logging Estructurado con Pino

## Estado

✅ **Decidido** — se adopta **Pino** como logger estructurado de `apps/api`, detrás de un **port `Logger`** (application) con un **adapter Pino** (infrastructure), y **redacción obligatoria** de campos sensibles (ADR-013). Implementado en el mismo PR (convención: los ADR se revisan en el PR que los implementa). Alcance: solo `apps/api`.

---

## Contexto

Hoy `apps/api` tiene **43 llamadas `console.*`** dispersas, sin niveles, sin correlación, sin formato estructurado y sin redacción. Al desglosarlas aparecen dos poblaciones distintas:

| Población | Dónde | Cantidad | Naturaleza |
|---|---|---|---|
| **Output al usuario (CLI)** | `infrastructure/cli/ingestar.ts` | 24 | UX de terminal, NO es logging |
| **Logging de aplicación** | `application` (1 archivo) + `infrastructure` (rate-limits, middleware, db-safety, boot, errores) | ~19 | logging real |

Tres problemas del logging actual:

1. **Sin estructura ni niveles.** `console.warn`/`console.error` planos: imposible filtrar por nivel, correlacionar por request, ni parsear en agregadores. Render recibe texto suelto.
2. **Riesgo de fuga de datos sensibles (ADR-013).** Nada impide que un `console.error(obj)` con montos o PII (email, número de cuenta) termine en los logs de Render. El scrubbing que el dominio aplica a los errores se pierde si el logging no lo garantiza.
3. **Acoplamiento en la capa application.** Los `console.*` en `process-ingesta.use-case.ts` son un atajo que salta la regla de dependencias (ADR-005): la lógica de aplicación no debería conocer el mecanismo concreto de logging.

**Relación con ADR-019 (Tracking y Monitoring).** ADR-019 (🔵 en discusión) cubre **error/crash tracking** (SDKs de Sentry → GlitchTip): capturar excepciones con stack trace y alertas. Esto es **complementario, no solapado**: Pino es el **log estructurado de aplicación** (requests, eventos de negocio, warnings operativos). Uno agrega excepciones; el otro registra el flujo. Este ADR no bloquea ni reemplaza a ADR-019.

## Decisión

Adoptar **Pino** para `apps/api` con esta forma:

1. **Port `Logger`** en `application/ports/logger.port.ts` — interfaz framework-agnóstica (`debug`/`info`/`warn`/`error`, con `context` opcional). La capa application depende solo de esta interfaz.
2. **Adapter `PinoLogger`** en `infrastructure/logging/` — implementa el port sobre Pino. La composition root lo instancia e inyecta en los use cases que lo necesitan.
3. **Redacción obligatoria (ADR-013).** El logger se configura con `redact` sobre las rutas sensibles conocidas: montos (`cargo`, `abono`, `monto`, `montos`), PII (`email`, `numeroCuenta`, `rut`, `password`) y credenciales de transporte (`authorization`, `cookie`, `set-cookie`). El dinero y el PII **nunca** llegan a stdout en crudo.
4. **Request logging con `pino-http`** en la capa Express — un log por request con id de correlación, method, path, status y latencia. Reemplaza los `console.*` sueltos de middleware/routes.
5. **Formato por ambiente (ADR-029).** `pino-pretty` legible en dev; JSON a stdout en prod (Render agrega stdout). Sin transporte a archivos ni servicios externos (eso es alcance de ADR-019).
6. **La CLI queda fuera.** Los 24 `console.*` de `ingestar.ts` son output al usuario, no logs; se conservan tal cual.

## Alternativas consideradas

- **`console.*` (status quo)** — rechazada: sin niveles, sin estructura, sin redacción; es el problema, no la solución.
- **Winston** — rechazada: más pesado y más lento que Pino, con API centrada en transports; Pino es structured-first y el estándar de facto en Node moderno por performance (logging asíncrono, bajo overhead).
- **Bunyan** — rechazada: antecesor de Pino, mantenimiento reducido; Pino lo supera en performance y ecosistema.
- **Pino sin port (directo en application)** — rechazada: viola la regla de dependencias de ADR-005; la capa application quedaría acoplada a un detalle de infraestructura.

## Consecuencias

- **Logs estructurados y redactados.** JSON parseable en prod, con redacción que hace cumplir ADR-013 a nivel de logger, no solo de dominio.
- **application desacoplada.** Los use cases dependen del port `Logger`; el mecanismo (Pino) vive en infraestructura y se inyecta desde la composition root. Testeable con un doble en memoria.
- **Correlación por request** vía `pino-http` (id de request), base para depurar flujos.
- **Complementario a ADR-019.** Cuando el error tracking entre en alcance, Pino y Sentry conviven: logs de flujo + agregación de excepciones.
- **Nuevas dependencias:** `pino`, `pino-http` (prod); `pino-pretty` (dev).
- **Producción:** sin cambios de despliegue — el JSON va a stdout, que Render ya captura.
