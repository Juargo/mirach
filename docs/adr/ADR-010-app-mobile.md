---
tags:
  - adr
  - fase-diseño
  - mobile
proyecto: MoneyDiary
estado: ✅ Decidido
fecha_creacion: 2026-07-02
fecha_actualizacion: 2026-07-19
---

# ADR-010 — App Mobile: React Native + Expo (dev-client) + Expo Router + NativeWind

## Estado

✅ **Decidido** — alcance **post-MVP**. La decisión se toma ahora (no la construcción) para que la arquitectura del contrato (ADR-011 Contrato-first OpenAPI, ADR-012 packages api-client) se prepare desde ya para dos consumidores en lugar de refactorizarse después.

> [!note] Enmienda — 2026-07-19
> La premisa de este ADR de que "la captura de cartolas seguirá siendo un flujo mayormente de escritorio" (ver Contexto) queda **parcialmente revisada** por ADR-026 Ingesta desde Mobile (Sprint-8): mobile gana una **única** capacidad de escritura —subir cartola vía `POST /api/ingestas`—, acotada a la ingesta. Toda otra escritura (editar transacciones/categorías) sigue fuera. El stack y la frontera de este ADR no cambian.

---

## Contexto

MoneyDiary nació como app web (ADR-003 Frontend, ADR-008 Frontend Stack). Sin embargo, una app de finanzas personales se consulta mayoritariamente **desde el teléfono**: revisar movimientos, categorizar un gasto recién hecho, mirar el estado de las cuentas en cualquier momento. La captura de cartolas (`.xlsx`/`.pdf`) seguirá siendo un flujo mayormente de escritorio, pero la **consulta** es intrínsecamente móvil.

La decisión de mobile se documenta **ahora, antes del MVP web terminado**, por una razón puramente arquitectónica: si el contrato HTTP se diseña asumiendo un único consumidor web (tipos a mano, cliente acoplado a `localStorage`), agregar mobile después obliga a rehacer esa capa. Decidir mobile hoy es lo que **justifica** ADR-011 Contrato-first OpenAPI y ADR-012 packages api-client: el contrato único y el `api-client` agnóstico de plataforma solo tienen sentido pleno con dos plataformas a la vista.

**Perfil del desarrollador (heredado de ADR-003 Frontend):** experiencia en Angular, aprendiendo React en web. React Native reutiliza el mismo modelo mental de React (componentes, hooks, estado), maximizando la transferencia de lo aprendido en `apps/web` sin partir de cero en un paradigma nuevo.

**Restricción de coherencia:** web y mobile deben compartir **el contrato HTTP y nada más**. No se comparten componentes UI ni estilos (ADR-012 packages api-client). Esa frontera es deliberada.

---

## Opciones Evaluadas

### Opción A — PWA (la web instalable, sin app nativa)

Aprovechar `apps/web` como Progressive Web App instalable.

✅ Cero código nuevo — reutiliza el frontend existente.
✅ Un solo codebase que mantener.
❌ Acceso limitado/inconsistente a capacidades nativas (almacenamiento seguro, biométricos, notificaciones push) — justo lo que una app financiera quiere para proteger la sesión.
❌ Experiencia y distribución de segunda clase en iOS (soporte PWA históricamente recortado).
❌ No cumple la expectativa de "app del banco" que el usuario tiene para finanzas.

### Opción B — Flutter

Framework de Google, Dart, UI propia (Skia/Impeller).

✅ Rendimiento excelente y UI muy consistente entre plataformas.
✅ Tooling maduro.
❌ **Dart** — lenguaje nuevo, cero transferencia desde el aprendizaje React del proyecto. Rompe la coherencia de stack (todo el resto es TypeScript).
❌ No puede reutilizar `@moneydiary/api-client` (TypeScript). Habría que regenerar el contrato para Dart → duplica la maquinaria de ADR-011 Contrato-first OpenAPI.
❌ Dos ecosistemas de dependencias que auditar (pub + npm), en contra de la disciplina de seguridad de ADR-006 Package Manager.

### Opción C — React Native con CLI "bare"

React Native sin Expo, configuración nativa manual.

✅ Control total sobre el proyecto nativo (iOS/Android).
✅ Sin capa de abstracción de Expo.
❌ Setup y mantenimiento nativo manual (Xcode, Gradle, linking) — fricción alta para un solo desarrollador sin experiencia mobile nativa previa.
❌ Actualizaciones de versión de RN dolorosas sin el tooling de Expo.
❌ Se pierden módulos listos (`expo-secure-store`, `expo-router`) que resuelven necesidades concretas del proyecto.

### Opción D — React Native + Expo (dev-client) ✅ (elegida)

React Native con el toolchain de Expo, usando **development build (dev-client)** en lugar de Expo Go.

✅ **Máxima transferencia** del React aprendido en web (mismo modelo de componentes/hooks).
✅ **Reutiliza `@moneydiary/api-client`** (TypeScript) sin regenerar nada — el mismo contrato sirve a web y mobile.
✅ Tooling de Expo (EAS build, OTA updates, módulos nativos listos) reduce drásticamente la fricción nativa para un solo dev.
✅ **`expo-secure-store`** provee almacenamiento cifrado del token — la implementación de `TokenStorage` que espera ADR-012 packages api-client.
✅ **dev-client** (no Expo Go) permite incluir módulos nativos arbitrarios desde el día uno, sin la caja de arena de Expo Go.
✅ Un solo ecosistema de dependencias (npm/pnpm) → misma auditoría de seguridad que el resto del monorepo.
⚠️ Curva de aprendizaje del entorno RN/Metro/EAS y de estilos con NativeWind.

---

## Decisión

**La app mobile se construye con React Native + Expo (development build / dev-client), Expo Router para navegación y NativeWind para estilos. Reutiliza `@moneydiary/api-client`, TanStack Query y Zustand. Vive en `apps/mobile` dentro del monorepo pnpm.**

| Componente | Elección | Correlato en web (ADR-008) |
|---|---|---|
| Framework | React Native + Expo (dev-client) | React + Vite |
| Navegación | Expo Router (file-based) | TanStack Router (file-based) |
| Estilos | NativeWind (Tailwind para RN) | Tailwind CSS + shadcn/ui |
| Server state | **TanStack Query** (compartido) | TanStack Query |
| Client state | **Zustand** (compartido) | Zustand |
| Contrato HTTP | **`@moneydiary/api-client`** (compartido) | `@moneydiary/api-client` |
| Token storage | `expo-secure-store` (impl. de `TokenStorage`) | `localStorage`/cookies |

**Qué se comparte y qué no** (frontera de ADR-012 packages api-client):

- ✓ **Contrato HTTP** (`@moneydiary/api-client`), **TanStack Query** y **Zustand** — son agnósticos de DOM y corren idénticos en React Native.
- ✗ **Componentes UI** — RN usa `<View>`/`<Text>`/`<Pressable>`, no `<div>`/`<button>`. shadcn/ui no aplica.
- ✗ **Estilos** — NativeWind (no el Tailwind de web) porque RN no tiene CSS; NativeWind compila utilidades Tailwind a `StyleSheet` de RN.
- ✗ **Hooks de pantalla / routing** — Expo Router ≠ TanStack Router; las pantallas son específicas de plataforma.

### Estructura en el monorepo

```
apps/
  mobile/
    app/                    ← Expo Router (file-based): pantallas
      _layout.tsx
      index.tsx
      transacciones/
    src/
      api/
        client.ts           ← createApiClient({ baseUrl, storage: mobileStorage })
        storage.ts          ← TokenStorage con expo-secure-store
      components/           ← componentes RN nativos (NO shadcn)
      stores/               ← Zustand (compartible en patrón con web)
    app.json                ← config Expo
    package.json
```

### Versiones objetivo (al 2026-07-02)

- Expo SDK (última estable al iniciar construcción) + `expo-dev-client`
- React Native (la versión que fije el SDK de Expo elegido)
- `expo-router` (file-based)
- `nativewind ^4`
- `@tanstack/react-query ^5` (misma major que web)
- `zustand ^5` (misma que web)
- `expo-secure-store`

> Las versiones exactas de Expo SDK / RN se fijan al momento de scaffolding (post-MVP), tomando la última estable disponible entonces. Se documentan aquí como objetivo, no como pin.

---

## Seguridad

- **Token en almacenamiento cifrado:** `expo-secure-store` usa Keychain (iOS) y Keystore (Android), no almacenamiento en claro. Es superior al `localStorage` de web para el secreto de sesión, y es la razón concreta por la que `TokenStorage` (ADR-012 packages api-client) se definió con firma **async**.
- **dev-client vs Expo Go:** el development build permite auditar y fijar exactamente qué módulos nativos entran, en vez de depender del runtime genérico de Expo Go. Reduce superficie no controlada.
- **Un solo ecosistema de dependencias:** al ser todo npm/pnpm, `apps/mobile` queda cubierto por `pnpm audit --audit-level=high` y `minimum-release-age` de ADR-006 Package Manager — no se abre un segundo canal de supply-chain (como habría pasado con Flutter/pub).
- **Superficie de red:** el cliente HTTP es el mismo `@moneydiary/api-client` ya endurecido (interceptores, manejo de 401). Mobile no reimplementa lógica de red propia que pudiera introducir fugas de token.
- **OTA updates (EAS Update):** si se habilitan, las actualizaciones over-the-air deben firmarse y restringirse a canales controlados. Se detalla al configurar EAS (fuera del alcance de este ADR).

---

## Consecuencias

**Positivas:**
- **Reutilización real de arquitectura:** el mismo contrato, la misma capa de server/client state. Agregar mobile no duplica la lógica de datos, solo la capa de presentación (que *debe* ser distinta de todos modos).
- **Transferencia de aprendizaje:** React → React Native es incremental; el desarrollador no cambia de paradigma ni de lenguaje.
- **Justifica y valida el diseño del contrato:** mobile es la prueba de que ADR-011 Contrato-first OpenAPI y ADR-012 packages api-client valían la pena — un segundo consumidor real que se conecta sin fricción.
- **Almacenamiento de sesión más seguro** que web, gracias a `expo-secure-store`.
- **Coherencia de toolchain:** todo TypeScript, un solo `pnpm audit`, un solo lockfile.

**A tener en cuenta:**
- **Post-MVP, no ahora:** la construcción no arranca hasta cerrar el MVP web. El riesgo es que la decisión "envejezca" (Expo SDK cambia rápido); mitigación: las versiones se fijan al scaffolding, no hoy.
- **NativeWind ≠ Tailwind web:** aunque comparten sintaxis de utilidades, hay diferencias (no todas las clases existen, layout es Flexbox de RN). El conocimiento de Tailwind transfiere parcialmente, no 1:1.
- **UI totalmente separada:** cada pantalla se implementa dos veces (web y mobile). Es un costo aceptado y deliberado — no se intenta compartir componentes, justamente para evitar el pantano de la UI universal.
- **Tooling nativo mínimo pero presente:** EAS build, perfiles de firma iOS/Android, y eventualmente cuentas de App Store / Play Store. Fricción operativa nueva para un solo desarrollador.
- **Peso del monorepo:** `apps/mobile` agrega dependencias pesadas (RN, Metro). El orden de build del monorepo (ADR-012 packages api-client) debe contemplar que mobile consume `@moneydiary/api-client` ya generado.

---

## No incluido en este ADR (decisiones futuras)

- **Estrategia de autenticación** (login, refresh, biométricos): se decide en un ADR de auth posterior. Este ADR solo fija que el token vive en `expo-secure-store` vía `TokenStorage`.
- **Notificaciones push, deep linking:** se definen al planificar la construcción real.
- ~~**Distribución (App Store / Play Store / EAS):** se define al planificar la construcción real.~~ → **Decidido en ADR-022 Ruta de Despliegue Mobile** (distribución interna EAS para la demo del Máster; stores diferidos).
- ~~**Testing mobile** (Jest + React Native Testing Library / Detox): se decide al escribir el primer test de UI mobile.~~ → **Decidido en ADR-017 Testing Mobile** (Jest + jest-expo + RNTL + Maestro para E2E).
- **Modo offline / sincronización:** relevante para mobile pero fuera del alcance del MVP.
- **Versiones exactas de Expo SDK / React Native:** se fijan al hacer scaffolding, tomando la última estable disponible entonces.

---

## Referencias

- ADR-003 Frontend — base React + TypeScript que React Native extiende al móvil
- ADR-005 Monolito-Modular-Clean-Architecture — patrón de puertos/DI replicado en el frontend
- ADR-006 Package Manager — pnpm workspaces + seguridad de dependencias (un solo ecosistema)
- ADR-008 Frontend Stack — stack web hermano; correlato de cada decisión
- ADR-011 Contrato-first OpenAPI — contrato único que mobile consume
- ADR-012 packages api-client — cliente compartido; define el `TokenStorage` que mobile implementa con `expo-secure-store`
- [Expo — Development builds](https://docs.expo.dev/develop/development-builds/introduction/)
- [Expo Router](https://docs.expo.dev/router/introduction/)
- [NativeWind](https://www.nativewind.dev/)
- [expo-secure-store](https://docs.expo.dev/versions/latest/sdk/securestore/)

---

*Fecha de decisión: 2026-07-02*
