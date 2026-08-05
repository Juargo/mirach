---
tags:
  - adr
  - fase-diseño
  - toolchain
  - testing
  - accesibilidad
  - ux
proyecto: MoneyDiary
estado: ✅ Decidido
fecha_creacion: 2026-07-12
fecha_actualizacion: 2026-08-05
---

# ADR-018 — Testing de Accesibilidad (a11y) + UX: pila por capas web y mobile

## Estado

✅ **Decidido** — la pila **web** se aplica en `apps/web` desde ya; la pila **mobile** es **post-MVP** (se activa con `apps/mobile`, ADR-010 App Mobile). Complementa el stack de testing funcional (ADR-016 Testing Framework Vitest, ADR-017 Testing Mobile) con la dimensión de accesibilidad, y enlaza la validación de UX con ADR-014 Técnicas de Validación de Requisitos.

✅ **Implementado en mobile — capas automatizables 1 y 2 (2026-08-05)** — sobre la config de ESLint de `apps/mobile` (ADR-020):

- **Capa 1 (lint):** `eslint-plugin-react-native-a11y` en el gate de ESLint (13 de sus 14 reglas de `all` activas como error). Se **desactivó `has-accessibility-hint`**: `accessibilityHint` es opcional por diseño (RN docs / Apple HIG) y forzarlo en cada control agrega verbosidad que perjudica al lector de pantalla. Corre con ESLint 9 (ver ADR-020: eslint-config-expo fija esa major).
- **Capa 2 (componentes/CI):** **se descartó `react-native-accessibility-engine`** — su v3.2.0 crashea con `react-test-renderer` 19 / React Native 0.86 (accede a internals de RTR que React 19 cambió; proyecto sin mantenimiento). La capa 2 se cubre con las **queries semánticas de RNTL** (`getByRole`/`getByLabelText` + matchers a11y integrados en `@testing-library/react-native` 14), que este ADR ya listaba como parte de la capa 2. El criterio central "color + texto" del semáforo (US-016) ya estaba verificado así.
- **Capas 3 (VoiceOver/TalkBack manual + Maestro) y 4 (checklist WCAG 2.2 AA) siguen pendientes** — son manuales/proceso, no automatizables en CI. La automatización cubre ~57% (ver nota abajo); no marcan "a11y hecho" por sí solas.

---

## Contexto

MoneyDiary muestra información financiera sensible (movimientos, semáforo 50/30/20, montos con signo). Que sea **usable y accesible** no es cosmético: un color de semáforo sin texto alternativo, un input sin etiqueta o un orden de foco roto dejan fuera a personas con lectores de pantalla o baja visión, y degradan la UX de todos. El proyecto ya tiene la dimensión de **validación de UX** cubierta en ADR-014 Técnicas de Validación de Requisitos (demos, pruebas de usabilidad con 5 usuarios / think-aloud / SUS, piloto). Falta fijar la **verificación de accesibilidad**: qué herramientas la automatizan y qué se comprueba a mano.

**Aclaración de alcance (a11y vs UX):**

- **UX (¿es fácil y satisfactorio de usar?)** → ya decidido en ADR-014 Técnicas de Validación de Requisitos: es *validación* cualitativa con usuarios. Este ADR **no la reemplaza**; solo añade una revisión de heurísticas UX como paso previo barato a esas pruebas.
- **Accesibilidad (¿puede usarlo todo el mundo, incl. tecnologías de asistencia?)** → es *verificación* técnica, parcialmente automatizable. Es el núcleo de este ADR.

**Punto de partida conocido:** en web ya se contempla `eslint-plugin-jsx-a11y` (lint de autoría). Es solo la primera capa. En **mobile no existe un equivalente obvio** — de ahí este ADR, que fija la pila RN completa.

**Estándar objetivo:** **WCAG 2.2 nivel AA** como referencia común para web y mobile (adaptado a las semánticas nativas de RN vía `accessibilityRole`/`accessibilityLabel`).

> Nota de cobertura: la automatización a11y detecta ~57% de las incidencias reales por volumen (estudio Deque sobre axe-core), no el 100%. Por eso la pila **combina** lint + tests automáticos + verificación manual con lector de pantalla. Ninguna capa sola es suficiente.

---

## Opciones Evaluadas

La decisión no es "una herramienta" sino **una pila por capas**; se evaluó qué poner en cada capa alineándolo con el stack ya decidido.

### Capa 1 — Autoría (lint estático)

- **Web:** `eslint-plugin-jsx-a11y` — estándar de facto para JSX. ✅ elegido.
- **Mobile:** `eslint-plugin-react-native-a11y` — equivalente para RN (detecta props de accesibilidad faltantes/ inválidas). ✅ elegido. *(No cubre lo que `jsx-a11y` porque RN no usa HTML; es su análogo nativo.)*

### Capa 2 — Componentes (tests automáticos en CI)

- **Web — Opción A: `jest-axe`** ❌ — atado a Jest, que ADR-016 Testing Framework Vitest retira.
- **Web — Opción B: `vitest-axe`** ✅ (elegida) — wrapper de axe-core para Vitest; corre en las mismas suites de componentes. Complementado con las **queries semánticas de Testing Library** (`getByRole`, `getByLabelText`) que ya son parte del stack.
- **Mobile — Opción C: `react-native-accessibility-engine`** ✅ (elegida en diseño) — aserciones a11y sobre el árbol de RN con React Test Renderer, encaja en Jest (`jest-expo`, ADR-017 Testing Mobile). Complementado con las queries semánticas de **React Native Testing Library** (`getByRole`, `getByLabelText`). ⚠️ **Descartado en implementación (2026-08-05):** su v3.2.0 no soporta `react-test-renderer` 19 / RN 0.86 (crashea al inicializar, accede a internals de RTR que React 19 cambió; proyecto sin mantenimiento). La capa 2 quedó cubierta por las **queries semánticas de RNTL** — el complemento ya previsto en esta misma opción.

### Capa 3 — E2E / runtime (app corriendo)

- **Web:** **`@axe-core/playwright`** ✅ — ejecuta axe sobre el DOM real en el navegador dentro de los E2E de Playwright (ADR-016 Testing Framework Vitest); reporta violaciones WCAG con selectores accionables. Quality gate en cada PR.
- **Mobile:** **verificación manual con lector de pantalla** (VoiceOver en iOS, TalkBack en Android) sobre los flujos críticos + flujos **Maestro** (ADR-017 Testing Mobile) que validan `accessibilityLabel`/foco donde sea automatizable. `@react-native-ama/core` (AMA) queda como **opcional** para warnings a11y en tiempo de desarrollo (dev-client). `axe DevTools Mobile` (Deque, comercial) **descartado** para el MVP por coste/licencia.

### Capa 4 — Manual / heurística (ambas plataformas)

- Checklist WCAG 2.2 AA de "smoke a11y" (contraste, foco visible, navegación por teclado en web, orden de lectura del lector de pantalla, targets táctiles ≥44px en mobile).
- Revisión de **heurísticas de UX** (Nielsen) como paso barato **antes** de las pruebas de usabilidad de ADR-014 Técnicas de Validación de Requisitos.

---

## Decisión

**Pila de testing de accesibilidad por capas, con UX validada vía ADR-014 Técnicas de Validación de Requisitos. Objetivo WCAG 2.2 AA.**

| Capa | Web (`apps/web`) | Mobile (`apps/mobile`, post-MVP) |
|---|---|---|
| **Autoría (lint)** | `eslint-plugin-jsx-a11y` | `eslint-plugin-react-native-a11y` |
| **Componentes (CI)** | `vitest-axe` + queries semánticas de Testing Library | queries semánticas de RNTL (`getByRole`/`getByLabelText`) — `react-native-accessibility-engine` **descartado** por incompatibilidad con RTR 19/RN 0.86 (ver Estado) |
| **E2E / runtime** | `@axe-core/playwright` (gate por PR) | VoiceOver / TalkBack manual + flujos Maestro; AMA opcional en dev |
| **Manual / heurística** | Checklist WCAG 2.2 AA + heurísticas Nielsen | Checklist WCAG 2.2 AA (táctil/lector) + heurísticas Nielsen |
| **UX (validación)** | Pruebas de usabilidad, SUS, think-aloud → ADR-014 Técnicas de Validación de Requisitos | ídem |

### Dependencias

**Web:**
```bash
pnpm web add -D eslint-plugin-jsx-a11y vitest-axe @axe-core/playwright
```

**Mobile (post-MVP):**
```bash
pnpm mobile add -D eslint-plugin-react-native-a11y react-native-accessibility-engine
# @react-native-ama/core opcional (dev-time warnings)
# VoiceOver/TalkBack: nativos del SO, sin dependencia
```

### Convenciones de código a11y

- **Todo control interactivo** lleva nombre accesible: `aria-label`/`<label>` en web, `accessibilityLabel` + `accessibilityRole` en RN.
- **El semáforo 50/30/20 nunca comunica estado solo por color** — siempre acompaña texto/ícono (WCAG 1.4.1). Esto es un criterio de aceptación a11y explícito para las US de visualización (US-016).
- Los montos con signo se anuncian de forma inequívoca al lector de pantalla (ingreso/gasto), no solo por color.

---

## Consecuencias

**Positivas:**

- **Coherencia con el stack decidido:** `vitest-axe` reusa Vitest (ADR-016 Testing Framework Vitest) y `@axe-core/playwright` reusa Playwright; en mobile todo cae dentro de Jest/`jest-expo` (ADR-017 Testing Mobile). No se introduce runner nuevo.
- **Quality gate temprano:** a11y se verifica en cada PR (lint + axe), no en una auditoría tardía.
- **Cubre el hueco mobile:** el proyecto pasa de "no sé cómo se prueba a11y en RN" a una pila concreta (lint + engine + lector de pantalla).
- **Refuerza requisitos de negocio:** el criterio "color + texto" en el semáforo protege un mensaje central del producto para usuarios con daltonismo/baja visión.
- **Un solo ecosistema npm/pnpm** → cubierto por `pnpm audit` (ADR-006 Package Manager).

**A tener en cuenta:**

- **La automatización no basta (~57% de cobertura):** la verificación manual con lector de pantalla es obligatoria en los flujos críticos; no se puede "marcar a11y como hecho" solo con axe verde.
- **Mobile es post-MVP:** las versiones de las libs a11y se fijan al scaffolding de `apps/mobile`, alineadas al Expo SDK elegido (ADR-010 App Mobile).
- **AMA / axe DevTools Mobile diferidos:** AMA es opcional; el axe comercial se reconsidera solo si el MVP mobile lo justifica.
- **UX no se duplica aquí:** cualquier métrica/validación de usabilidad se rige por ADR-014 Técnicas de Validación de Requisitos; este ADR solo aporta la revisión heurística previa.
- **DoD:** para las US de UI, "accesible" entra en la Definition of Done — lint a11y limpio, tests `vitest-axe`/engine verdes y checklist WCAG 2.2 AA de smoke pasado.

---

## Referencias

- [Playwright — Accessibility testing (@axe-core/playwright)](https://playwright.dev/docs/accessibility-testing)
- [vitest-axe](https://github.com/chaance/vitest-axe)
- [eslint-plugin-jsx-a11y](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y)
- [eslint-plugin-react-native-a11y](https://github.com/FormidableLabs/eslint-plugin-react-native-a11y)
- [react-native-accessibility-engine](https://github.com/aryella-lacerda/react-native-accessibility-engine)
- [React Native — Accessibility](https://reactnative.dev/docs/accessibility)
- [WCAG 2.2 (W3C)](https://www.w3.org/TR/WCAG22/)
- ADR-006 Package Manager
- ADR-010 App Mobile
- ADR-014 Técnicas de Validación de Requisitos
- ADR-016 Testing Framework Vitest
- ADR-017 Testing Mobile

---

*Fecha de decisión: 2026-07-12 · Última actualización: 2026-08-05*
