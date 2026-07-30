---
tags:
  - adr
  - fase-diseño
  - frontend
proyecto: MoneyDiary
estado: ⚠️ Parcialmente reemplazado
fecha_creacion: 2026-06-10
fecha_actualizacion: 2026-07-02
---

# ADR-008 — Frontend Stack (Estructura, Estilos, Estado, Routing)

## Estado

⚠️ **Parcialmente reemplazado** (2026-07-02) por ADR-011 Contrato-first OpenAPI y ADR-012 packages api-client.

> **Qué se reemplaza:** únicamente la decisión de la sección *"¿Compartir código entre `apps/api` y `apps/web`?"* — es decir, **"no se crea un `packages/shared`"** y **"los tipos del response se escriben a mano en el frontend"**. Al entrar una segunda plataforma consumidora (ADR-010 App Mobile), mantener el contrato a mano en tres lugares dejó de ser aceptable. El contrato pasa a emitirse como `openapi.json` desde el backend (ADR-011 Contrato-first OpenAPI) y a consumirse vía el paquete compartido `@moneydiary/api-client` (ADR-012 packages api-client). Nótese que este es exactamente el camino que **este mismo ADR ya dejó previsto** más abajo ("OpenAPI codegen vía `@nestjs/swagger` + `openapi-typescript`… se reevalúa si la duplicación genera dolor").
>
> **Qué sigue vigente (todo lo demás):** monorepo con `pnpm workspaces`, Tailwind CSS + shadcn/ui, TanStack Query (server state), Zustand (client state) y TanStack Router. Estas decisiones no se tocan.

---

## Contexto

ADR-003 Frontend estableció React + TypeScript + Vite como base del frontend, pero dejó explícitamente abiertas tres decisiones que React no impone: **estructura del repositorio**, **librería de estilos**, **manejo de estado**, y **routing**.

Con el cierre del Sprint 1 (backend de ingesta completo + Supabase/Prisma integrados), el frontend pasa de "decisión diferida" a "siguiente trabajo a ejecutar". Antes de hacer `vite create` conviene cerrar las cuatro decisiones porque cualquiera de ellas, mal elegida, implica rehacer scaffold o tener dos formas de hacer lo mismo conviviendo.

**Perfil del desarrollador (heredado de ADR-003):** 4 años de experiencia en Angular, primer proyecto en React. El objetivo es contrastar paradigmas, no minimizar la curva de aprendizaje.

**Contexto de producto:** MVP de finanzas personales con filtros por banco, rango de fechas y categoría — los search params tipados van a ser load-bearing para compartir URLs de filtros.

---

## Opciones Evaluadas

### 1. Estructura del repositorio

**Repositorios separados** — `MoneyDiary` (backend) y `MoneyDiary-Web` (frontend) como dos repos. Más simple para cada proyecto, pero pull requests cross-repo son tediosos y hacer cambios coordinados (endpoint nuevo + consumirlo en UI) requiere dos PRs sincronizados.

**Monorepo con pnpm workspaces ✅** — `apps/api` (NestJS actual) y `apps/web` (frontend nuevo) en el mismo repo. pnpm workspaces ya está disponible (ADR-006). Permite PRs atómicos que tocan ambas capas y `pnpm-lock.yaml` único.

**Nx / Turborepo** — Monorepo con orquestador de tasks y cache de builds. Excelente para 5+ apps, pero ceremonia excesiva para 2. Se podría incorporar más adelante si crece el número de paquetes.

#### ¿Compartir código entre `apps/api` y `apps/web`?

> ⚠️ **Reemplazado por ADR-011 Contrato-first OpenAPI + ADR-012 packages api-client (2026-07-02).** La decisión de esta subsección ("sin `packages/shared`" + "tipos a mano") se revirtió al entrar ADR-010 App Mobile. Se conserva el texto original abajo por trazabilidad histórica. El resto del ADR sigue vigente.

Decisión deliberada: **no se crea un `packages/shared` ni equivalente.**

Compartir las entities/value-objects del backend rompería la dirección de dependencias del ADR-005 (Clean Architecture: el frontend NO debe acoplarse al dominio). El contrato real entre ambos lados son los **DTOs HTTP** (`apps/api/src/infrastructure/http/dto/`), no las entities del dominio.

Los tipos del response se escriben a mano en el frontend (`apps/web/src/api/types.ts`), cerca del cliente HTTP. Si aparece duplicación dolorosa más adelante, se reconsidera con dos caminos posibles:
- `packages/contracts` con schemas Zod (single source of truth + validación runtime)
- OpenAPI codegen vía `@nestjs/swagger` + `openapi-typescript`

Ninguno de los dos paga su costo con ~3-5 endpoints y un solo desarrollador. La opción "Opción 1" se confirma para el MVP.

---

### 2. Librería de estilos

**CSS Modules / vanilla CSS** — Funciona, sin dependencias, pero requiere construir todo el sistema de diseño desde cero. No agrega aprendizaje sobre React.

**Material UI / Mantine / Chakra** — Componentes pre-construidos con su propio sistema de temas. Estética muy reconocible (cuesta diferenciarla) y el theming queda atado a la librería.

**Tailwind CSS + shadcn/ui ✅** — Tailwind como utility-first CSS, shadcn/ui como **componentes copiables** (no es una librería con `npm install`, sino código que vive en el repo y se modifica libremente). Encaja con los mockups del usuario en Stitch (Stitch genera UIs con estética Tailwind/shadcn nativa) y permite control total sobre cada componente.

---

### 3. Manejo de estado (server + cliente)

**`useState` / `useContext` puros** — Sin dependencias, curva nula, suficiente para apps ≤3 pantallas. Pero `useContext` re-renderiza el subárbol completo en cada cambio (mata performance rápido) y obliga a reescribir loading/error/retry en cada `useEffect` con fetch. En 2 sprints termina siendo TanStack Query mal hecho.

**Redux Toolkit (+ RTK Query)** — Una sola librería para todo. Ecosistema enorme y patrón único (slices/reducers/createApi). Pero genera 2-3× el código de la opción elegida, y para una app no colaborativa, no realtime, no offline-first, es matar mosca con cañón. RTK Query es bueno; TanStack Query es mejor.

**TanStack Query + Zustand ✅**
- **TanStack Query** maneja el *server state*: cache automático, refetch, mutations, retries, stale-while-revalidate, devtools. Cada `useQuery` apunta a un endpoint REST del backend NestJS.
- **Zustand** maneja el *client state* puro: filtros de la UI, wizard de carga, banco seleccionado. 5-10 líneas por store, sin Provider obligatorio.

Separar server state de client state es el patrón actualmente recomendado por la comunidad React (ya no se mete todo en Redux). Boilerplate mínimo, TypeScript first-class.

---

### 4. Routing

**React Router v7** — Standard de facto. v7 unificó Remix + React Router, soporta SPA puro o framework mode. Documentación abundante, ejemplos infinitos. Contra: type-safety en rutas/params es manual o requiere codegen; la nueva API de `loader`/`action` choca con TanStack Query (ambas quieren ser el data layer).

**TanStack Router ✅** — Type-safety end-to-end real: rutas, params y **search params validados con Zod**. Integra nativamente con TanStack Query (prefetch en `loader`, invalidación coordinada). Devtools propias. Contra: más nueva, menos ejemplos en español, curva más alta si nunca usaste type-safe routing.

La razón decisiva para TanStack Router: los **search params validados** son críticos para los filtros de transacciones del MVP (`?banco=BCI&desde=2026-01-01&hasta=2026-06-30`), y la integración con TanStack Query elimina el "qué librería se encarga del data fetching" típico de React Router + TanStack Query.

---

## Decisión

| Componente | Elección |
|---|---|
| Estructura | Monorepo con `pnpm workspaces` (`apps/api`, `apps/web`) — sin `packages/shared` |
| Estilos | Tailwind CSS + shadcn/ui |
| Server state | TanStack Query |
| Client state | Zustand |
| Routing | TanStack Router |

### Estructura del monorepo

```
MoneyDiary/
├── apps/
│   ├── api/                    ← Backend NestJS actual (move sin tocar src/)
│   │   ├── src/
│   │   ├── test/
│   │   ├── prisma/
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/                    ← Frontend nuevo
│       ├── src/
│       │   ├── routes/         ← TanStack Router (file-based)
│       │   ├── components/
│       │   │   └── ui/         ← shadcn/ui components
│       │   ├── stores/         ← Zustand stores
│       │   └── api/            ← TanStack Query hooks + types DTO
│       ├── package.json
│       └── vite.config.ts
├── pnpm-workspace.yaml
└── package.json                ← raíz: solo scripts y devDependencies comunes
```

### Versiones objetivo (al 2026-06-10)

- React `^19`, Vite `^6`, TypeScript `^5.6`
- Tailwind `^4` (nueva CSS engine) + shadcn/ui (última)
- `@tanstack/react-query ^5`
- `@tanstack/react-router ^1` (file-based routing con plugin de Vite)
- `zustand ^5`

---

## Consecuencias

**Positivas:**
- El monorepo permite PRs que tocan dominio + UI en un solo commit y `pnpm-lock.yaml` único.
- Tailwind + shadcn/ui evita "lock-in de design system": shadcn no es una dependencia, es código copiado al repo que se modifica libremente. Cambiar el look de un Button es editar `components/ui/button.tsx`, no patear contra un theme provider.
- TanStack Query + Zustand separa explícitamente cache de server vs estado de UI — un patrón que en Angular se mezcla en servicios con `BehaviorSubject` y termina en spaghetti. Este contraste es parte del aprendizaje declarado en ADR-003.
- TanStack Router con search params tipados elimina una clase entera de bugs (filtros con typos, conversiones manuales de string a Date) que en Angular se manejan con `ActivatedRoute.queryParams` + casts manuales.
- No tener `packages/shared` mantiene Clean Architecture intacta: el dominio del backend no se filtra al frontend, el contrato real son los DTOs HTTP.

**A tener en cuenta:**
- **Migración del backend a `apps/api`**: requiere mover `src/`, `test/`, `prisma/`, `package.json`, `tsconfig.json` y `.env` a la nueva ubicación. Los paths relativos dentro del código (imports de `src/...`) no cambian. CI scripts y comandos del CLAUDE.md (`pnpm cli`, `pnpm test`) deben re-anclarse al workspace correcto (`pnpm --filter @moneydiary/api ...`).
- **Sin `packages/shared`**: los tipos de los DTOs se escriben a mano en `apps/web/src/api/types.ts`. Si la API cambia y el frontend no actualiza el type, TypeScript NO va a avisar — el error aparece en runtime. Mitigación: en una US futura, si el dolor aparece, se evalúa Zod en `packages/contracts` u OpenAPI codegen.
- **TanStack Router es nuevo en el ecosistema**: si aparece un patrón sin documentar en español, el desarrollador va a tener que leer la docs oficial en inglés. Es un costo aceptado a cambio del type-safety.
- **shadcn/ui requiere CLI propia** (`npx shadcn@latest add button`) que copia componentes al repo. No hay "actualización automática" — si shadcn publica una mejora a `Button`, hay que re-correr el comando manualmente. Es el trade-off por tener control total.
- **Tailwind 4** cambió el sistema de configuración respecto a v3 (CSS-first config en lugar de `tailwind.config.js`). Si se siguen tutoriales viejos, pueden no aplicar tal cual.

---

## No incluido en este ADR (decisiones futuras)

- **Formularios**: React Hook Form vs Formik vs nativo. Se decide cuando aparezca el primer formulario complejo (US de filtros o categorización).
- **Validación de schemas**: Zod ya entra implícitamente con TanStack Router. Se confirmará como schema runtime único cuando aparezca validación de inputs no triviales.
- **Tests del frontend**: Vitest + React Testing Library es la opción default, pero se decide formalmente al escribir el primer test de UI.
- **i18n**: deferido — el MVP es 100% español por ahora.
- **`packages/contracts` o OpenAPI codegen**: deferido — se reevalúa si la duplicación de tipos DTO entre backend y frontend genera dolor.

---

## Referencias

- ADR-003 Frontend — base React + TypeScript + Vite
- ADR-005 Monolito-Modular-Clean-Architecture — estructura del backend que se preserva al mover a `apps/api`, y razón por la cual no se comparte el dominio
- ADR-006 Package Manager — pnpm workspaces ya disponible
- [TanStack Query docs](https://tanstack.com/query/latest)
- [TanStack Router docs](https://tanstack.com/router/latest)
- [shadcn/ui](https://ui.shadcn.com)
- [Tailwind CSS v4](https://tailwindcss.com)
- [Zustand](https://zustand.docs.pmnd.rs/)

---

*Fecha de decisión: 2026-06-10*
