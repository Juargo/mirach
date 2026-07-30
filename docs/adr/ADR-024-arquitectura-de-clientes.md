---
tags:
  - adr
  - fase-diseño
  - arquitectura
  - frontend
  - mobile
proyecto: MoneyDiary
estado: ✅ Decidido
fecha_creacion: 2026-07-16
fecha_actualizacion: 2026-07-16
---

# ADR-024 — Arquitectura de Clientes: backend rico + clientes delgados contract-first

## Estado

✅ **Decidido** — formaliza *ex-post* un patrón que ya está implementado y probado: `apps/web` (scaffold, Sprint post-1) y `apps/mobile` (Sprint 3, PRs #28–#30) ya lo siguen. Este ADR lo hace explícito para que las próximas features (UI web de US-015/016/017, crecimiento de la app mobile) no lo erosionen por accidente.

---

## Contexto

ADR-005 Monolito-Modular-Clean-Architecture definió la arquitectura del **backend** (monolito modular + Clean Architecture, dominio puro con `Result<T,E>`). Pero el sistema tiene **tres ejecutables** — API, web SPA y app mobile — y las decisiones sobre los clientes quedaron repartidas: ADR-008 Frontend Stack decidió *no* compartir dominio entre backend y web; ADR-011 Contrato-first OpenAPI fijó `openapi.json` como contrato único; ADR-010 App Mobile eligió el stack mobile. Ninguna respondió la pregunta arquitectónica de fondo: **¿qué estilo de arquitectura interna tiene cada cliente, y dónde vive la lógica?**

La pregunta no es cosmética. En apps financieras el error clásico es duplicar lógica de dinero en los clientes (recalcular totales, redondear porcentajes en el frontend) hasta que backend y UI muestran números distintos. Y el error opuesto también existe: imponer Clean Architecture completa a una SPA o a una app Expo, pagando capas y abstracciones que un cliente de UI no necesita.

**Restricciones relevantes:**

- El dominio financiero (dinero `BigInt`, cálculo 50/30/20 en basis points, semáforo) ya vive **una sola vez** en el backend, con tests exhaustivos (ADR-015: el riesgo se concentra en el dinero).
- Los montos viajan como **string** en los DTOs (BigInt-safe): los clientes no pueden hacer aritmética con ellos aunque quisieran — restricción deliberada.
- Un solo desarrollador mantiene los tres ejecutables: cada capa extra en un cliente es costo recurrente.
- Web y mobile tienen runtimes y test-runners distintos (Vitest/jsdom vs jest-expo — ADR-016/017), lo que encarece cualquier código "compartido" mal ubicado.

---

## Decisión

**El dominio canónico existe una sola vez, en el backend. Web y mobile son clientes delgados que consumen DTOs contract-first y solo contienen lógica de presentación. Cada cliente adopta el estilo interno mínimo que su plataforma pide — no se les impone la Clean Architecture del backend.**

### Regla de oro

> Si una regla afecta **cuánto dinero se muestra o cómo se clasifica**, vive en `apps/api/src/domain` y llega al cliente ya calculada en el DTO. Si una regla afecta **cómo se presenta** (formateo CLP, colores del semáforo, geometría de un gráfico, estados de carga), vive en el cliente.

### Web (`apps/web`) — SPA por capas técnicas ligeras

Patrón estándar del ecosistema React, sin capa de dominio propia:

```
apps/web/src/
  routes/           ← TanStack Router file-based: la URL es la estructura
  components/ui/    ← shadcn/ui copiado al repo (no dependencia)
  api/              ← TanStack Query hooks + tipos DTO escritos a mano (types.ts)
  stores/           ← Zustand: SOLO estado de cliente (UI state)
  lib/              ← cn() y helpers de presentación
```

- La separación arquitectónica clave es **server state vs client state**: los datos del negocio viven en el caché de TanStack Query (fuente: la API); Zustand guarda únicamente estado de UI (filtros, modales, preferencias). No se duplica server state en stores.
- **Prohibido importar de `apps/api/src/domain`** (reafirma ADR-008 Frontend Stack): el contrato real son los DTOs HTTP. Los tipos de `api/types.ts` se mantienen alineados con `openapi.json` (ADR-011 Contrato-first OpenAPI).

### Mobile (`apps/mobile`) — Clean Architecture en miniatura

Solo las capas que rentan, ya implementadas en Sprint 3:

```
apps/mobile/
  app/              ← Expo Router (navegación = infraestructura)
  src/
    domain/         ← lógica PURA de presentación, sin imports de React Native:
                      view-model del resumen, formateo CLP sobre string,
                      geometría del pie chart. TDD estricto.
    api/            ← cliente HTTP (fetchResumen) + config env (EXPO_PUBLIC_*)
    components/     ← pantalla resumen + estados Loading/Error/Empty (NativeWind)
```

- El `domain/` mobile **no es dominio de negocio**: es lógica de presentación que merece pureza porque es testeable sin renderizar (jest-expo levanta RN entero; los tests puros corren en milisegundos). Nunca recalcula dinero — transforma strings y basis points que ya llegan resueltos.
- Flujo de dependencias, misma regla que el backend a escala reducida: `domain ← api ← components/app`. Los componentes consumen el view-model; el view-model no sabe qué es un componente.

### Qué comparten los clientes (y qué no)

| Compartido | Mecanismo |
|---|---|
| Contrato HTTP | `openapi.json` (ADR-011 Contrato-first OpenAPI) — fuente única |
| Cliente HTTP | `@moneydiary/api-client` agnóstico de plataforma (ADR-012 packages api-client), cuando se materialice |
| **Nada más** | Sin `packages/shared` de tipos/lógica (ADR-008 Frontend Stack): la duplicación pequeña y visible (dos `types.ts`) es más barata que un paquete compartido entre tres runtimes |

---

## Opciones evaluadas

### Opción A — Compartir el dominio del backend con los clientes (`packages/shared`)

✅ Un solo lugar para tipos y reglas.
❌ Rompe la regla de dependencias de ADR-005 Monolito-Modular-Clean-Architecture: el dominio quedaría acoplado a tres runtimes (Node, browser, Hermes/RN) y a sus limitaciones (BigInt en Hermes, bundlers distintos).
❌ Invita a recalcular dinero en el cliente "porque la función está ahí" — exactamente el bug que se quiere impedir.
❌ Ya descartada en ADR-008 Frontend Stack; aquí se ratifica extendiéndola a mobile.

### Opción B — Clean Architecture completa en cada cliente

✅ Simetría conceptual con el backend.
❌ Una SPA y una app de lectura no tienen casos de uso ni puertos que justifiquen las capas: sería ceremonia sin dominio (los datos llegan resueltos).
❌ Triplica el costo de mantenimiento para un solo desarrollador.

### Opción C — Backend rico + clientes delgados, estilo por plataforma ✅ (elegida)

✅ La lógica de dinero tiene **una** fuente de verdad, testeada donde el riesgo se concentra (ADR-015).
✅ Cada cliente usa el patrón idiomático de su ecosistema (menor fricción, mejor documentación, contrataciones futuras más simples).
✅ Ya validada en producción: la pantalla mobile del "momento semáforo" se construyó así con TDD estricto (PRs #29/#30).

---

## Consecuencias

**Positivas:**
- **Imposibilidad estructural de divergencia de números**: los clientes no pueden mostrar un total distinto al del backend porque no calculan — los montos llegan como string.
- Los tests de cada pieza corren en su herramienta natural (Vitest para web, jest-expo para mobile, Vitest+SWC para api) sin paquetes puente.
- La UI web diferida (US-015/016/017) tiene ahora una guía explícita: consumir `/api/resumen` vía TanStack Query, cero cálculo local.

**A tener en cuenta:**
- **Duplicación controlada de tipos DTO** (web y mobile escriben los suyos): el costo es real pero visible; se mitiga cuando `@moneydiary/api-client` (ADR-012) se materialice generándolos desde `openapi.json`.
- **La regla de oro exige disciplina en review**: el checklist de peer review (ADR-015) debe incluir "¿este PR calcula dinero en un cliente?" como red flag.
- Si algún día se necesita **modo offline** en mobile (cálculo local sin red), esta decisión se revisa — ese sería el gatillo para mover lógica de negocio al cliente, y merecería su propio ADR.

---

## Referencias

- ADR-005 Monolito-Modular-Clean-Architecture — arquitectura del backend; este ADR define la de los clientes
- ADR-008 Frontend Stack — decisión original de no compartir dominio (web); aquí ratificada y extendida
- ADR-010 App Mobile — stack mobile sobre el que se aplica el patrón
- ADR-011 Contrato-first OpenAPI — `openapi.json` como contrato único entre backend y clientes
- ADR-012 packages api-client — pieza compartible legítima entre clientes
- ADR-015 Técnicas de Verificación de Requisitos — el riesgo se concentra en dinero y acceso; por eso el dinero no sale del backend
- ADR-016 Testing Framework Vitest / ADR-017 Testing Mobile — runners distintos que encarecen el código compartido

---

*Fecha de decisión: 2026-07-16*
