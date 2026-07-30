---
tags:
  - adr
  - fase-diseño
  - toolchain
  - observabilidad
  - seguridad
proyecto: MoneyDiary
estado: 🔵 En discusión
fecha_creacion: 2026-07-12
fecha_actualizacion: 2026-07-12
---

# ADR-019 — Tracking y Monitoring: SDKs de Sentry sobre backend compatible (GlitchTip)

## Estado

🔵 **En discusión — decisión final diferida.** La dirección propuesta (SDKs de Sentry + backend compatible, con Highlight descartado por deprecación) se documenta como recomendación de trabajo, pero **la elección final del backend de datos y del hosting se pospone para más adelante** (no bloquea el MVP; hoy los errores viven en los logs de Render). Se retomará cuando el tracking entre en alcance. Lo que sigue es la propuesta, no una decisión cerrada.

---

## Contexto

MoneyDiary necesita **error tracking** (capturar excepciones/crashes con stack trace, breadcrumbs y contexto de release) y **monitoring** ligero (errores por versión, performance básica) para el backend NestJS, el frontend web y —a futuro— la app mobile. Hoy, en pre-MVP, no hay ninguna plataforma configurada: los errores solo viven en los logs de Render/consola, sin agregación ni alertas.

Hay dos restricciones que dominan la decisión:

1. **Coste.** Es un proyecto de un solo desarrollador (TFM). El plan de pago de **Sentry** ($26/mes el Team, y escala con el volumen de eventos hasta $200–500/mes en apps con tráfico) es desproporcionado ahora.
2. **Privacidad de datos financieros (crítica).** MoneyDiary maneja montos, RUT, números de cuenta y tokens de sesión. Un payload de error puede arrastrar esos datos hacia la plataforma de monitoring. Esto choca de frente con ADR-013 Cifrado de Datos en Reposo y con el checklist de seguridad de ADR-015 Técnicas de Verificación de Requisitos. **Enviar datos financieros crudos a un SaaS de terceros no es aceptable**; hay que poder (a) auto-hospedar y/o (b) depurar PII agresivamente antes de enviar.

**Nota sobre Highlight.io (la alternativa OSS que se estaba considerando):** queda **descartada**. Highlight fue adquirida por LaunchDarkly (abril 2025) y su servicio hosted se **deprecó el 28 de febrero de 2026**, migrando todo a LaunchDarkly Observability. El repositorio sigue open source pero con desarrollo "sharply slowed" y sin soporte claro de React Native. Construir observabilidad sobre una plataforma en fin de vida es un riesgo que no vale la pena.

**Distinción de alcance:** este ADR cubre **error/crash tracking + performance básica**. La observabilidad profunda (métricas, tracing distribuido con OpenTelemetry + Grafana/Tempo/Loki, uptime) queda **diferida** como trabajo futuro — es sobreingeniería para el MVP; Render ya da logs e infra-metrics básicas.

---

## La idea que estructura la decisión

**Sentry son dos cosas separables:** (1) sus **SDKs** de instrumentación —los mejores mantenidos del mercado, estándar de facto, con soporte de primera para NestJS, React y Expo/React Native, incluida symbolication de crashes nativos— y (2) su **backend SaaS**, que es lo caro.

Varios backends hablan **el mismo protocolo de wire que Sentry**, así que se puede **instrumentar con los SDKs de Sentry y apuntar el DSN a un backend más barato o auto-hospedado**, sin acoplarse al SaaS. Esto desacopla *cómo instrumento* (fijo, Sentry SDKs) de *dónde aterrizan los datos* (flexible), y elimina el lock-in.

---

## Opciones Evaluadas

### Opción A — Highlight.io (OSS)

❌ **Servicio hosted deprecado (feb 2026)**; OSS semi-mantenido tras la adquisición por LaunchDarkly.
❌ Sin soporte claro de React Native.
❌ Auto-hospedaje pesado y con futuro incierto.
→ **Descartada.**

### Opción B — Sentry SaaS, plan gratuito (Developer)

Plan *free forever*: ~5.000 errores/mes, 10k performance units, 500 session replays, 1 usuario, 30 días de retención.

✅ Cero infraestructura que operar.
✅ SDKs de máxima calidad (backend, web, **Expo/React Native con crashes nativos**).
✅ Symbolication, releases, alertas listas.
❌ **Los datos salen de tu infraestructura** → riesgo de fuga de PII financiera (mitigable solo con scrubbing agresivo, nunca al 100%).
❌ Si el proyecto crece, salta a planes de pago caros (el problema original).
⚠️ Suficiente para pre-MVP, pero el techo gratuito y la privacidad son limitantes.

### Opción C — Sentry auto-hospedado (self-hosted)

✅ Datos 100% bajo tu control; feature completo (tracing, replay, symbolication).
❌ **40+ contenedores** — operativa y coste de infra desproporcionados para un solo dev.
→ Descartada por peso operativo.

### Opción D — GlitchTip (elegida como backend) ✅

Backend open-source **compatible con el protocolo de los SDKs de Sentry**. Ligero (**4 contenedores**: Django + Celery + PostgreSQL + Redis; corre en un VPS de 2 GB).

✅ **Reutiliza los SDKs de Sentry** (web, backend y **React Native con crashes nativos**) — solo cambia el DSN.
✅ **Auto-hospedable gratis** (datos financieros nunca salen de tu infra → cumple ADR-013 Cifrado de Datos en Reposo).
✅ **Cloud free tier**: 1.000 eventos/mes, proyectos/usuarios ilimitados — para arrancar sin montar nada.
✅ Crash reports, stack traces, release tracking y alertas — justo el núcleo que necesita el MVP.
✅ **Sin lock-in**: si algún día quieres session replay o tracing profundo, repuntas el mismo DSN a Sentry SaaS free sin reescribir instrumentación.
❌ **No** tiene session replay ni tracing distribuido completo, y menos integraciones que Sentry.

### Opción E — PostHog (evaluada, diferida)

Plataforma de product analytics + session replay + error tracking. Free generoso (1M eventos, 2.500 grabaciones mobile/mes), SDKs RN/Expo (replay en beta, requiere dev-build, con masking de contenido sensible), auto-hospedable.

✅ Todo-en-uno (analytics + replay + errores) con free amplio.
❌ Es **analytics-first**; el error tracking es más nuevo y menos profundo que Sentry/GlitchTip.
❌ Introduce alcance (product analytics) que el MVP no pidió → scope creep.
→ **Diferida**: candidata natural si más adelante se quiere product analytics + session replay unificados; hoy no.

---

## Propuesta (dirección recomendada — decisión final diferida)

**Instrumentar con los SDKs de Sentry en las tres plataformas y enviar los datos a GlitchTip.**

| Plataforma | SDK (instrumentación) | Destino de datos |
|---|---|---|
| Backend NestJS (`apps/api`) | `@sentry/nestjs` / `@sentry/node` | GlitchTip (DSN) |
| Web React (`apps/web`) | `@sentry/react` | GlitchTip (DSN) |
| Mobile Expo (`apps/mobile`, post-MVP) | `@sentry/react-native` (Expo SDK 50+) | GlitchTip (DSN) |

**Estrategia de hosting del backend de datos, por fases:**

1. **Arranque (MVP):** **GlitchTip Cloud, free tier** (1.000 eventos/mes) — valida el flujo end-to-end sin operar infraestructura.
2. **Cuando el volumen o la sensibilidad lo exijan:** **GlitchTip auto-hospedado** en un VPS pequeño (o servicio en Render, ADR-004 Hosting y Despliegue) → datos financieros 100% bajo control propio.
3. **Escape hatch:** si en el futuro se necesita session replay o tracing profundo, repuntar el mismo DSN a **Sentry SaaS free** (o de pago) sin tocar la instrumentación.

### Requisito de seguridad innegociable — PII/financial scrubbing

Independiente del destino, **antes de enviar cualquier evento** hay que depurar datos sensibles. Es condición de la Definition of Done de toda US que instrumente errores, y del checklist de seguridad de ADR-015 Técnicas de Verificación de Requisitos:

- `sendDefaultPii: false` en todos los SDKs.
- Hook `beforeSend` que **elimine montos, RUT, números de cuenta, emails y tokens** del payload (mensaje, `extra`, `contexts`, breadcrumbs, request bodies/headers).
- **Nunca** loggear el token de sesión ni el cuerpo crudo de cartolas/transacciones hacia el tracker.
- Reutilizar el patrón de *scrub de montos* que ya existe en el backend (mensajes de error de persistencia) y extenderlo al boundary de Sentry.
- El **DSN** es config por entorno (`.env`), nunca commiteado (ADR-006 Package Manager).

---

## Consecuencias

**Positivas:**

- **Coste ~0** en pre-MVP (GlitchTip cloud free) y ~$0–20/mes auto-hospedado después — resuelve el problema original de precio de Sentry.
- **Privacidad de datos financieros** preservable por auto-hospedaje, coherente con ADR-013 Cifrado de Datos en Reposo.
- **Una sola familia de SDKs** (Sentry) para backend + web + mobile → una única forma de instrumentar y de hacer scrubbing.
- **Cobertura mobile real**: `@sentry/react-native` sobre GlitchTip captura errores JS y crashes nativos iOS/Android.
- **Sin lock-in**: la compatibilidad de wire permite migrar a Sentry SaaS (o entre GlitchTip cloud/self-host) repuntando el DSN, sin reescribir código.

**A tener en cuenta:**

- **GlitchTip no tiene session replay ni tracing distribuido completo.** Si esos se vuelven necesarios, es un ADR nuevo (o el escape hatch a Sentry).
- **Auto-hospedar añade operativa**: un servicio más que actualizar, respaldar y asegurar (PostgreSQL, Redis). Por eso se arranca en cloud free y se auto-hospeda solo cuando se justifique.
- **El scrubbing de PII es trabajo activo, no gratis**: hay que escribir y testear el `beforeSend` y verificar (con un test) que ningún monto/RUT/token sale en un evento — riesgo real si se omite.
- **`sentry-expo` está deprecado**: usar `@sentry/react-native` (requiere Expo SDK 50+), no el paquete legacy.
- **Retención/límites** del free tier (1.000 eventos/mes en GlitchTip cloud) pueden quedarse cortos; es la señal para pasar a auto-hospedaje.
- **Observabilidad profunda diferida**: métricas/tracing con OpenTelemetry + Grafana quedan como trabajo futuro, fuera de este ADR.

---

## Referencias

- [GlitchTip — Open Source Error Tracking](https://glitchtip.com/)
- [GlitchTip — React Native SDK](https://glitchtip.com/sdkdocs/react-native/)
- [Self-Host Sentry or GlitchTip (2026)](https://danubedata.ro/blog/self-host-sentry-glitchtip-error-tracking-2026)
- [Sentry — Expo / React Native](https://docs.sentry.io/platforms/react-native/manual-setup/expo/)
- [Sentry pricing (2026)](https://last9.io/blog/sentry-pricing/)
- [Highlight → LaunchDarkly (migración/deprecación)](https://highlight.io/blog/launchdarkly-migration)
- [PostHog — React Native error tracking](https://posthog.com/docs/error-tracking/installation/react-native)
- ADR-004 Hosting y Despliegue
- ADR-006 Package Manager
- ADR-010 App Mobile
- ADR-013 Cifrado de Datos en Reposo
- ADR-015 Técnicas de Verificación de Requisitos

---

*Fecha de decisión: 2026-07-12 · Última actualización: 2026-07-12*
