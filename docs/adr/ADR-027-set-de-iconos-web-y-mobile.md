---
tags:
  - adr
  - fase-diseño
  - toolchain
  - frontend
  - mobile
  - ui
proyecto: MoneyDiary
estado: ✅ Decidido
fecha_creacion: 2026-07-20
fecha_actualizacion: 2026-07-20
---

# ADR-027 — Set de iconos unificado para web y mobile

## Estado

✅ **Decidido**

Formaliza el set de iconos de `apps/web` (ADR-008 Frontend Stack) —que hasta ahora estaba definido solo de facto por el default de shadcn/ui— y lo extiende como estándar único a `apps/mobile` (ADR-010 App Mobile), que todavía no tenía librería de iconos.

---

## Contexto

Tanto la UI web (dashboard 50/30/20, shell de navegación, categorías de transacción) como la app mobile necesitan iconografía. Hasta hoy no había una decisión explícita: el set se venía usando por inercia del scaffold. Antes de que la iconografía se disperse en dos lenguajes visuales distintos entre plataformas, conviene fijar un estándar único que preserve la cohesión de marca.

**Estado actual:**

- **Web (`apps/web`) NO está en cero.** Ya depende de **`lucide-react` (`^0.469.0`)** y lo usa en 7 archivos: `src/lib/category-icons.ts` (las 8 categorías canónicas mapeadas a iconos, tipadas con `LucideIcon`), `src/components/app-shell/nav-items.ts` (navegación del shell), `MonthYearPicker.tsx`, `PeriodoSelector.tsx`, entre otros. Además, **`lucide-react` es el default de shadcn/ui** (ADR-008 Frontend Stack): cada `npx shadcn@latest add <component>` genera componentes que importan de `lucide-react`. Sacarlo implicaría no solo migrar los 7 archivos, sino overridear ese default de forma permanente.
- **Mobile (`apps/mobile`) SÍ está en cero.** No hay ninguna librería de iconos instalada. Hoja en blanco: cualquier set requiere una dependencia nueva.

**La decisión NO es "qué set elijo de cero"**, sino: *¿pago el costo de sacar lucide de web para unificar en otro set, o unifico sobre lo que ya está embebido?*

**Criterios de evaluación** (el riesgo real acá es la cohesión de marca y el costo de migración, no la cantidad de iconos —cualquier set moderno cubre las necesidades del MVP):

1. **Cross-platform real** — soporte first-class en React *y* React Native, para un único lenguaje visual entre web y mobile.
2. **Self-hosted / tree-shakeable** — SVG en el bundle, sin font externa ni CDN (valor ya explicitado en el comentario de `category-icons.ts` y coherente con la postura de seguridad del proyecto).
3. **Alineación con el tooling existente** — fricción con el default de shadcn/ui.
4. **Costo de migración** — cuánto código hay que tocar para adoptarlo.
5. **Licencia y salud del paquete** — permisiva y activamente mantenido, cubierto por `pnpm audit` (ADR-006 Package Manager).

---

## Opciones Evaluadas

### Opción A — Unificar sobre `lucide` (web + mobile) ✅ (elegida)

Adoptar `lucide-react` como estándar web (ya está) y `lucide-react-native` en mobile.

✅ **Cero migración en web** — lucide ya está embebido en los 7 archivos; no se toca una línea
✅ **Alineado con shadcn/ui** — es su default; no hay que pelear con el generador en cada `add`
✅ **Cross-platform** — `lucide-react-native` expone los **mismos nombres de iconos**, así que el mapeo `ICONO_POR_CATEGORIA` de web es directamente portable a mobile (misma cohesión visual, sin re-decidir iconos)
✅ SVG self-hosted, tree-shakeable, sin font/CDN
✅ ISC (permisiva), activamente mantenido, en npm → cubierto por `pnpm audit`
❌ Estética estándar/genérica (mitigado: la identidad de marca la carga la paleta "Serene Finance" ADR-008 Frontend Stack, no el trazo del icono)

### Opción B — Migrar todo a Iconoir (web + mobile)

Reemplazar lucide por `iconoir-react` en web e `iconoir-react-native` en mobile.

✅ Estética más distintiva (grid 24px consistente, trazo propio)
✅ Cross-platform real — `iconoir-react-native` (v7, MIT) existe y está mantenido
✅ SVG self-hosted, MIT
❌ **Peaje de migración en web** — sacar lucide de 7 archivos, retipar `LucideIcon`, re-mapear las 8 categorías
❌ **Fricción permanente con shadcn/ui** — su default seguirá siendo lucide; hay que overridear los imports generados en cada componente nuevo, para siempre
❌ El beneficio (estética) es subjetivo; el costo (migración + fricción permanente) es concreto y recurrente

### Opción C — Híbrido: lucide en web, Iconoir en mobile ❌ (rechazada)

Dejar cada plataforma con su set.

❌ **Dos lenguajes visuales distintos** — el mismo concepto (ej: "ahorro") se dibuja diferente en web y mobile, rompiendo la cohesión de marca
❌ Duplica el mapeo categoría → icono con dos sets de nombres distintos
❌ Contradice el objetivo de un producto visualmente coherente entre clientes (ADR-024 Arquitectura de Clientes)
Se documenta solo para dejar registro de por qué se descarta.

---

## Decisión

**Set de iconos único para todos los clientes: `lucide`.**

### Web (`apps/web`)

Sin cambios. Se **ratifica** `lucide-react` (`^0.469.0`) como el set oficial, ya en uso. Se mantiene el default de shadcn/ui tal cual.

### Mobile (`apps/mobile`)

Adoptar el equivalente React Native:

- Instalar `lucide-react-native` con la **misma línea de versión** que la `lucide-react` de web, para garantizar paridad de nombres e iconos entre plataformas.
- Instalar su peer dependency `react-native-svg` usando **`npx expo install react-native-svg`** (no `pnpm add` directo): así Expo resuelve la versión compatible con el SDK 57 en vez de una arbitraria del rango del peer.
- Reutilizar la convención de `apps/web/src/lib/category-icons.ts`: el mapeo categoría → icono es portable tal cual, porque los nombres de export coinciden (`ShoppingCart`, `Fuel`, `PiggyBank`, etc.).

### Regla go-forward

Todo icono nuevo, en cualquier cliente, se toma de lucide. Introducir un segundo set de iconos requiere un ADR que lo justifique.

---

## Consecuencias

**Positivas:**

- **Un único lenguaje visual** entre web y mobile con **cero migración**: se construye sobre lo que ya está, no contra ello.
- Sin fricción con shadcn/ui — el generador y el set de iconos apuntan al mismo lugar.
- El mapeo categoría → icono se comparte conceptualmente entre plataformas (mismos nombres), evitando re-decidir iconografía en mobile.
- SVG self-hosted y tree-shakeable en ambos clientes: sin font externa ni CDN, coherente con la postura de seguridad y rendimiento del proyecto.
- Dependencias en npm bajo `pnpm audit` (ADR-006 Package Manager).

**A tener en cuenta:**

- **Verificar el rango del peer `react-native-svg`** de `lucide-react-native` contra la versión que bundlea Expo SDK 57; usar `npx expo install` mitiga desalineaciones. Si aparece un choque de versiones, resolverlo antes de mergear la primera pantalla mobile con iconos.
- **Mantener alineadas las versiones** de `lucide-react` y `lucide-react-native` al actualizar, para no divergir en el set disponible entre clientes.
- La estética de lucide es deliberadamente estándar. La **identidad de marca la aporta la paleta y la tipografía "Serene Finance"** (ADR-008 Frontend Stack), no el trazo del icono. Si a futuro se prioriza una iconografía más distintiva, se reabre con un ADR que asuma explícitamente el costo de migración y la fricción con shadcn.
- Actualizar el `CLAUDE.md` del repo para registrar lucide como el set de iconos oficial web+mobile.

### Criterio de cierre (DoD)

Esta decisión se da por aplicada cuando: (1) `apps/mobile` tiene `lucide-react-native` + `react-native-svg` instalados vía `expo install` y una pantalla renderiza al menos un icono lucide en dispositivo/simulador; (2) las versiones de `lucide-react` y `lucide-react-native` están alineadas; (3) `pnpm audit` limpio; (4) commit con Conventional Commits.

---

## Referencias

- [Lucide — documentación oficial](https://lucide.dev/)
- [lucide-react (web)](https://lucide.dev/guide/packages/lucide-react)
- [lucide-react-native (React Native)](https://lucide.dev/guide/packages/lucide-react-native)
- [Iconoir](https://iconoir.com/) — evaluado y descartado (Opción B)
- ADR-006 Package Manager
- ADR-008 Frontend Stack
- ADR-010 App Mobile
- ADR-024 Arquitectura de Clientes

---

*Fecha de decisión: 2026-07-20 · Última actualización: 2026-07-20*
