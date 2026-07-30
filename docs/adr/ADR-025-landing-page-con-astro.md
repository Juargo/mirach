---
tags:
  - adr
  - fase-diseño
  - frontend
  - landing
  - hosting
proyecto: MoneyDiary
estado: ✅ Decidido
fecha_creacion: 2026-07-17
fecha_actualizacion: 2026-07-17
---

# ADR-025 — Landing page: workspace propio `apps/landing` con Astro estático

## Estado

✅ **Decidido** (2026-07-17, planning de Sprint-5) — resuelve la tarea **0-L.1** del Track L. Aplica a US-022/US-023 (épica Landing).

---

## Contexto

El Sprint-5 introduce la **landing page pública** de MoneyDiary (marketing + captación hacia la beta). Antes de construirla hay que decidir **dónde vive y con qué stack**. La opción intuitiva era meterla en `apps/web` (el aplicativo ya existe, comparte marca y Tailwind), pero landing y aplicativo tienen requisitos opuestos:

- **La landing necesita SEO real.** `apps/web` es una SPA (TanStack Router renderiza en el cliente): crawlers y previews de redes (OG) ven HTML casi vacío. Darle SSR/prerender a la SPA solo por marketing agrega complejidad que el aplicativo no necesita.
- **La landing necesita ser liviana.** US-022 CA-01 exige hero visible en ≤3 s en móvil; servir React + TanStack + Zustand para una página estática lo compromete de entrada.
- **Perfiles de seguridad distintos.** La landing es pública y **sin secretos por diseño**; `apps/web` vivirá detrás del proxy que inyecta `x-api-key` (Tarea 0-W) con una CSP de aplicación. Compartir deploy = compartir headers, dominio y riesgo: un cambio de copy redeployaría el aplicativo.
- **Dos grupos en paralelo** (Sprint 5): workspaces separados eliminan conflictos de merge entre Grupo L y Grupo W.
- ADR-023 Topología de Despliegue ya separa conceptualmente `moneydiary.cl` (público) de `app.moneydiary.cl` (aplicativo); ADR-024 Arquitectura de Clientes define a los clientes como consumidores delgados de la API — la landing ni siquiera es un cliente: **no consume la API**.

---

## Decisión

**La landing vive en un workspace propio del monorepo — `apps/landing` — construida con Astro como sitio 100 % estático, y se despliega como proyecto Vercel independiente bajo el dominio raíz.**

Reglas que fija esta decisión:

1. **`apps/landing` es un workspace pnpm más** (`packages: ['apps/*']` ya lo cubre): mismos hooks de raíz (ADR-020), mismo CI con typecheck + build, shortcut raíz `pnpm landing ...`.
2. **Astro en modo estático puro** (`output: 'static'`): cero JavaScript en el cliente por defecto (islands solo si una sección lo justifica). HTML completo en build → SEO, OG previews y Lighthouse resueltos estructuralmente.
3. **Sin secretos, sin API:** la landing no llama a la API de MoneyDiary ni contiene variables sensibles. El check de CI "bundle sin secretos" (tarea L1.6) lo verifica de todos modos.
4. **Deploy separado en Vercel** (ADR-004): proyecto propio, `moneydiary.cl` (o el dominio que se compre en 23.2); el aplicativo web queda reservado en `app.*`. Headers de seguridad propios (CSP estricta trivial al no haber JS de terceros, HSTS, nosniff).
5. **Identidad visual compartida por copia, no por paquete:** tokens de Tailwind (colores/tipografía del mockup Stitch) se replican en la config de la landing. Coherente con ADR-008/024: nada de `packages/shared` para evitar acoplar tres runtimes por unos hex codes.
6. **Tailwind 4 vía `@tailwindcss/vite`** (mismo major que `apps/web`; Astro lo soporta de primera). Sin NativeWind ni restricciones mobile aquí.

---

## Opciones evaluadas

### Opción A — Landing como rutas dentro de `apps/web`

✅ Un solo proyecto frontend; reutilización directa del theme y componentes shadcn.
❌ SEO/OG requieren agregar SSR o prerender a la SPA — complejidad permanente para beneficio de una página.
❌ Bundle de aplicación servido a visitantes de marketing (CA-01 en riesgo).
❌ Acopla deploys y CSP de una página pública con el aplicativo que maneja el proxy de la API key.
❌ Grupo L y Grupo W trabajando sobre el mismo workspace en el mismo sprint.

### Opción B — Repositorio separado para la landing

✅ Aislamiento total.
❌ Segundo repo que mantener (CI, hooks, dependabot, convenciones) para un solo desarrollador; contradice la decisión de monorepo (ADR-008).
❌ Pierde el peer review cruzado y los gates de seguridad (ADR-021) ya montados en este repo.

### Opción C — `apps/landing` con Astro estático en el monorepo ✅ (elegida)

✅ SEO/performance resueltos por construcción: HTML estático, cero JS por defecto (islands opt-in).
✅ Superficie de ataque mínima: sin runtime en el cliente, sin secretos, CSP estricta sin excepciones.
✅ Hereda CI, hooks, convenciones y review del monorepo; deploy independiente en Vercel.
✅ Paralelismo limpio entre grupos del Sprint 5.
⚠️ Herramienta nueva en el stack (ver Consecuencias) — asumida: el equipo ya quería adoptar Astro y su modelo (componentes `.astro` + Tailwind) es de curva corta.

### Opción D — Vite + React con prerender estático (sin Astro)

✅ Sin herramienta nueva; mismo mental model que `apps/web`.
❌ El prerender en Vite/React es plugin-dependiente y menos idiomático que en Astro; se termina cargando React para una página sin interactividad.
❌ Más fácil que "se filtre" JS innecesario al bundle público.

---

## Seguridad

- **Cero secretos estructuralmente:** la landing no tiene `.env` de producción. El grep de secretos sobre el output de build (L1.6) corre igual en CI como red de seguridad (RNF-SEC-005).
- **CSP estricta sin `unsafe-inline` ni orígenes de terceros** (US-023 CA-04): al no haber JS propio ni analítica (ADR-019 sigue en discusión), la política puede ser mínima.
- **Sin PII en contenido:** capturas de la app solo con datos demo anonimizados — mismo criterio que los fixtures `-test` y el riesgo aceptado 11.6.
- **Aislamiento de blast radius:** un compromiso o defacement de la landing no toca el aplicativo, la API ni sus secretos (proyectos Vercel y dominios separados).

---

## Consecuencias

**Positivas:**
- SEO, OG y performance quedan resueltos por arquitectura, no por optimización posterior.
- La landing puede evolucionar (más páginas: privacidad, changelog, blog post-MVP) sin tocar jamás el aplicativo.
- `apps/landing` da al monorepo el cuarto ejecutable con el patrón de ADR-024 llevado al extremo: cliente tan delgado que ni siquiera consume la API.

**A tener en cuenta:**
- **Astro es una herramienta más** en un stack ya amplio (Vite, Expo, Nest): se acepta porque su ámbito es acotado (solo la landing) y era adopción deseada por el equipo. Si la landing algún día necesita interactividad seria, las islands permiten React sin migrar.
- **Duplicación de tokens de diseño** (Tailwind config): visible y barata; si crece a 3+ superficies, revisitar con un preset compartido de Tailwind (no un package de lógica).
- La versión de Astro y su integración Tailwind se fijan al hacer el scaffold (0-L.2); respetar `.npmrc` (`minimum-release-age`) al instalar.

---

## No incluido en este ADR

- **Dominio definitivo** (compra/DNS): tarea 23.2 con el PO.
- **Analítica de la landing:** diferida hasta cerrar ADR-019 Tracking y Monitoring.
- **Waitlist con backend / formularios:** post-MVP; si llega, se decide su mecanismo (edge function vs servicio externo) en su propio ADR.

---

## Referencias

- Sprint-5 — Track L, tarea 0-L.1 (origen de esta decisión)
- US-022 / US-023
- ADR-004 Hosting — Vercel + GitHub Actions (proveedor del deploy)
- ADR-008 Frontend Stack — monorepo pnpm; no compartir código entre runtimes
- ADR-020 Git Hooks Husky Monorepo / ADR-021 Análisis de Seguridad en el Pipeline — gates que hereda el nuevo workspace
- ADR-023 Topología de Despliegue — separación `moneydiary.cl` / `app.moneydiary.cl`
- ADR-024 Arquitectura de Clientes — backend rico + clientes delgados; la landing como caso límite (no-cliente)
- [Astro — Static Site Generation](https://docs.astro.build/)

---

*Fecha de decisión: 2026-07-17*
