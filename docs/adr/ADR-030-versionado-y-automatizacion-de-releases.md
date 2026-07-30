---
tags:
  - adr
  - fase-diseño
  - infraestructura
  - proceso
proyecto: MoneyDiary
estado: ✅ Decidido
fecha_creacion: 2026-07-27
fecha_actualizacion: 2026-07-27
---

# ADR-030 — Versionado Independiente por Paquete y Automatización de Releases con release-please

## Estado

✅ **Decidido** — se adopta (a) **versionado independiente por workspace** (`apps/api`, `apps/web`, `apps/mobile`, `apps/landing`), cada uno con su propio semver y changelog, y (b) **release-please** como herramienta que deriva el bump y el `CHANGELOG.md` desde los Conventional Commits ya obligatorios (ADR-020 Git Hooks Husky Monorepo), generando un tag con prefijo por paquete que sirve además de trigger para separar el CD. La implementación se ejecutará como un change SDD aparte.

✅ **Implementado** — change SDD `versioning-release-automation` mergeado a `main` (2026-07-27) vía **4 PRs encadenados**: #118 (Slice A — enforcement de ADR-020 Git Hooks Husky Monorepo, precondición de este ADR) · #119 (Slice B — bootstrap de release-please en manifest mode) · #120 (Slice C — split de CI por path) · #121 (Slice D — CD híbrido). **Pendiente:** activación en plataformas (secret `EXPO_TOKEN`, Root Directory + Deep Clone en Vercel, sincronizar `buildFilter` en Render) y protección de rama en `main` (ítem C.7). **Follow-up abierto:** auditar el gate de ADR-021 Análisis de Seguridad en el Pipeline contra el CI ya partido por path.

---

## Contexto

MoneyDiary es un monorepo pnpm workspaces (ADR-008 Frontend Stack) con cuatro artefactos desplegables a tres targets distintos: `apps/api` (Render), `apps/web` y `apps/landing` (Vercel), `apps/mobile` (EAS). Hoy el versionado **no existe como concepto**, solo como forma:

| Punto | Estado actual |
|---|---|
| Versión de cada paquete | **Todos en `0.0.1`** (raíz + los 4 workspaces + `app.json` de mobile) |
| Cómo se bumpea | A mano, nunca — nadie lo toca |
| Changelog | No hay |
| CI | **Un solo `ci.yml`**, sin filtros de path: cualquier PR corre el typecheck de todo |
| CD | Fuera de Actions — Render y Vercel auto-deployan por webhook al push a `main`; EAS es manual |

Dos problemas concretos:

1. **La versión no significa nada.** `0.0.1` en lockstep de facto, combinado con deploy continuo, hace que el número no comunique absolutamente nada: no dice qué cambió, ni qué hay en producción, ni cuándo. Es peor que no tener versión, porque aparenta información que no existe.
2. **El CI/CD no está separado por parte.** Un cambio en el landing dispara el CI de la API; Render y Vercel probablemente rebuildan aunque el cambio no los toque. No hay aislamiento por workspace.

Hay además una asimetría de fondo que ningún esquema único puede honrar: **las tres partes versionan cosas semánticamente distintas**.

| Parte | Qué versiona de verdad | Naturaleza |
|---|---|---|
| **API** | El contrato HTTP (ADR-011 Contrato-first OpenAPI) + trazabilidad de "qué commit está en prod" | Servicio desplegado |
| **Web / Landing** | Un deploy **continuo** — el usuario siempre ve la última | Deploy continuo |
| **Mobile** | Artefactos **inmutables** sujetos a reglas de tienda | Binario distribuido |

Mobile es el caso serio: una vez publicado un build, el usuario tiene **esa** versión hasta que actualiza, y las tiendas exigen un identificador de build **monotónico** (`android.versionCode` / `ios.buildNumber`) que no se puede reusar. Forzar una versión común a las tres acoplaría ritmos que son intrínsecamente distintos.

La motivación primaria del proyecto es **aprender ingeniería de software** (ADR-001 Backend Framework). El versionado semántico con changelog y la separación de pipelines son fundamentos que hoy están ausentes y merecen una decisión explícita. El disparador fue la necesidad de que cada parte tenga **semver con changelog** que comunique cambios.

Materia prima disponible: **Conventional Commits ya es obligatorio** vía commitlint en el hook `commit-msg` (ADR-020 Git Hooks Husky Monorepo). Es exactamente el insumo que las herramientas de release derivan.

> **Nota de implementación (2026-07-27):** esta premisa resultó imprecisa. Al ejecutar el change SDD se descubrió que ADR-020 Git Hooks Husky Monorepo estaba **documentado pero nunca construido** — no había husky ni commitlint instalados en el repo. En vez de un insumo ya disponible, se convirtió en **precondición del Slice A** de este change (ver Estado, arriba).

---

## Opciones evaluadas

Este ADR resuelve cuatro preguntas acopladas.

### 1. ¿Versión compartida (lockstep) o independiente por paquete?

- **Opción A — Independiente por workspace.** ✅ (elegida)
  Cada app lleva su propio semver, su propio `CHANGELOG.md` y su propio tag. `apps/api@1.4.0` puede avanzar sin tocar `apps/mobile@1.0.2`.
  ✅ Honra la asimetría de naturaleza (servicio / deploy continuo / binario). Cada parte comunica **sus** cambios a **su** ritmo.
  ❌ Cuatro versiones que seguir en vez de una (mitigado: la herramienta las gestiona sola).

- **Opción B — Lockstep (una versión para todo el monorepo).**
  ❌ Acopla ritmos distintos: subir mobile a la tienda forzaría un bump de la API sin que la API haya cambiado. Es justo lo que este ADR viene a evitar. **Descartada.**

### 2. ¿Cómo se determina el bump y el changelog?

- **Opción A — Manual + git tags con prefijo.**
  Subir la versión a mano y taggear (`api-v1.2.0`).
  ✅ Cero tooling.
  ❌ **No produce changelog** — que es justamente el requisito. Depende de disciplina humana. **Descartada por no cumplir el objetivo.**

- **Opción B — Changesets.**
  Cada PR agrega un archivo `.md` declarando qué paquete cambia y con qué bump; un bot los consume y bumpea + genera changelog.
  ✅ Estándar de facto para monorepos; control humano fino del changelog.
  ❌ Está pensado para **librerías publicadas a npm** con múltiples contribuidores. Exige declarar el bump **dos veces** (en el commit convencional y en el archivo changeset) → redundante con ADR-020 Git Hooks Husky Monorepo. MoneyDiary no publica libs: son **apps**, y el changelog es para el equipo, no para un consumidor externo que decide si actualiza. **Descartada.**

- **Opción C — release-please (Google).** ✅ (elegida)
  Corre en GitHub Actions. **Deriva el bump y el changelog directamente de los Conventional Commits** (`feat:` → minor, `fix:` → patch, `!`/`BREAKING CHANGE` → major). En cada push a `main` abre/actualiza un **"release PR" por paquete** que bumpea la versión y actualiza el `CHANGELOG.md`; al mergear ese PR, crea el **git tag con prefijo** (`api-v1.4.0`) y el GitHub Release.
  ✅ **Cero ceremonia extra**: consume el commit que ya se escribe, sin archivo adicional. Soporta monorepo nativo (manifest mode) con versión y changelog **por paquete**. El tag por paquete es un trigger natural para el CD separado (ver pregunta 4).
  ⚠️ El mapeo commit → paquete es **por path** del cambio, no por el scope del commit: exige la disciplina de no mezclar cambios de varios workspaces en un mismo commit (o el commit cuenta para varios releases).

  Dado que Conventional Commits **ya es obligatorio**, release-please elimina el paso redundante de Changesets sin perder el changelog automático. Es la opción de mayor coherencia con lo existente.

### 3. ¿Cuál es la fuente de verdad de la versión de mobile?

Mobile distingue tres identificadores que **no** son lo mismo:

- `version` — semver visible en la tienda (ej. `1.3.0`).
- `android.versionCode` / `ios.buildNumber` — entero/monotónico, **debe** incrementar en cada build subido.
- `runtimeVersion` — compatibilidad de OTA updates (`expo-updates`).

- **Opción A — release-please dueño de `version`; EAS dueño del monotónico; `runtimeVersion` diferido.** ✅ (elegida)
  release-please bumpea el `version` semver del `app.json` (derivado de los commits). El `versionCode`/`buildNumber` los autogestiona **EAS con `autoIncrement`** (remote versioning), que lleva la cuenta del lado del servicio y garantiza monotonicidad aunque se buildee desde cualquier máquina.
  ✅ Separación limpia de responsabilidades: semver comunicativo por un lado, identificador de build técnico por el otro, sin que se pisen.
  ✅ `runtimeVersion` se **difiere** (YAGNI): ADR-022 Ruta de Despliegue Mobile es distribución interna de APK, no OTA. Se decide cuando (si) se adopte `expo-updates`.

- **Opción B — release-please gestiona los tres campos.**
  ❌ Reimplementaría lo que EAS ya hace bien (contador remoto monotónico), con riesgo de colisión de builds si se buildea fuera del pipeline. **Descartada.**

### 4. ¿Cómo se separa el CI/CD?

- **CI — workflows por app con filtros de path.** ✅ (elegida)
  Partir el `ci.yml` monolítico en workflows por workspace con `on.push.paths` / `paths`, de modo que cada uno corra solo cuando cambia su código. Gana aislamiento y un status verde/rojo por parte (valor didáctico). La alternativa (un workflow con job `changes` + `dorny/paths-filter` y jobs condicionales) es más DRY pero colapsa el status en un solo check — **descartada** por menos legible para este proyecto.

- **CD — el tag con prefijo de release-please como trigger por parte.** ✅ (elegida como mecanismo)
  Los tags `api-v*`, `web-v*`, `mobile-v*`, `landing-v*` que emite release-please al cerrar cada release PR son el disparador de despliegue de **esa** parte (`on: push: tags: 'api-v*'`). **Queda como sub-decisión del change SDD** si cada deploy se sigue delegando a la plataforma (agregando "ignored paths" en Render y "ignored build step" en Vercel para cortar el rebuild innecesario) o se mueve a Actions (deploy explícito). Mobile (EAS) sí o sí necesita su propio pipeline disparado por tag o manual. Probable resultado: **híbrido** — web/api/landing siguen por plataforma con filtros; mobile por tag/manual en Actions.

---

## Decisión

1. **Versionado independiente por workspace.** Cada uno de `apps/api`, `apps/web`, `apps/mobile`, `apps/landing` lleva su propio semver y su propio `CHANGELOG.md`. Se descarta el lockstep.

2. **release-please en GitHub Actions, manifest mode**, como fuente de automatización. Deriva bump y changelog de los Conventional Commits (ADR-020 Git Hooks Husky Monorepo); abre un release PR por paquete; al mergear, emite el tag y el GitHub Release. Se descartan Changesets (redundante para apps) y el versionado manual (no da changelog).

3. **Tags con prefijo por paquete** con el formato `<paquete>-vX.Y.Z` (`api-v1.4.0`, `web-v0.3.0`, `mobile-v1.0.0`, `landing-v0.2.0`). Son la identidad de release **y** el trigger del CD separado.

4. **Mobile: fuente de verdad dividida.** release-please es dueño del campo `version` (semver visible); **EAS con `autoIncrement`** es dueño de `android.versionCode` / `ios.buildNumber` (monotónico remoto). `runtimeVersion` se difiere hasta que exista OTA (ADR-022 Ruta de Despliegue Mobile).

5. **CI separado por path.** El `ci.yml` monolítico se parte en workflows por workspace con filtros de path, de modo que cada parte corra su verificación de forma aislada.

6. **CD disparado por tag**, con el detalle de "plataforma con filtros vs. Actions" resuelto por parte en el change SDD. Mobile obtiene pipeline propio (EAS por tag/manual).

7. **Conventional Commits es la materia prima y se mantiene obligatorio.** ADR-020 Git Hooks Husky Monorepo deja de ser solo higiene de historial: pasa a alimentar directamente el versionado. Se añade la disciplina de **no mezclar cambios de varios workspaces en un mismo commit** para que el mapeo commit → paquete (por path) sea limpio.

8. **Baseline de versión inicial a definir en el change SDD.** Hoy todo está en `0.0.1`; hay que fijar un punto de partida coherente por paquete (p. ej. `0.x` para lo que aún no es estable, y evaluar si lo que ya corre en producción merece `1.0.0`).

---

## Consecuencias

**Positivas:**
- **La versión pasa a significar algo.** Cada número comunica, vía changelog derivado, qué cambió y cuándo, por parte.
- **Cero ceremonia sobre lo que ya se hace.** release-please consume los Conventional Commits existentes; no hay archivo extra por PR ni bump manual.
- **CI/CD separado con un solo mecanismo.** El tag con prefijo resuelve simultáneamente el versionado independiente y el trigger de despliegue por parte.
- **Coherencia con el proceso vigente.** ADR-020 Git Hooks Husky Monorepo gana un segundo propósito; ADR-011 Contrato-first OpenAPI se beneficia de un semver explícito para el contrato de la API.
- **Trazabilidad real.** El tag + GitHub Release por paquete responde "qué está en prod" sin heurísticas.

**A tener en cuenta:**
- **Permisos y config de Actions.** release-please requiere permisos `contents: write` y `pull-requests: write`, más los archivos `release-please-config.json` y `.release-please-manifest.json`. Verificar la doc vigente al implementar (Context7) — la herramienta evoluciona.
- **Disciplina de commits por paquete.** El mapeo es por path: un commit que toca `apps/api` **y** `apps/web` cuenta para ambos releases. Hay que evitar commits cross-workspace o asumir el efecto.
- **Baseline de versión.** Migrar desde el `0.0.1` uniforme exige fijar un punto de partida por paquete antes de la primera corrida (decisión del change SDD).
- **Coordinación release-please ↔ EAS en mobile.** Dos sistemas tocan la versión de mobile; el pipeline debe garantizar que release-please escriba `version` y EAS escriba el monotónico sin pisarse.
- **Migrar el CD actual conlleva riesgo.** Pasar del auto-deploy por webhook (Render/Vercel) a un modelo disparado por tag —o agregarle filtros de path a las plataformas— toca producción; hacerlo por partes y verificado.
- **Landing incluido.** `apps/landing` es un paquete desplegable más y entra en el esquema, aunque su ritmo de cambios sea bajo.
- **La implementación va como change SDD aparte**, igual que ADR-029 Ambientes y Validación de Entorno, para no inflar el alcance de esta decisión.

---

## Referencias

- ADR-020 Git Hooks Husky Monorepo — Conventional Commits + commitlint; es la materia prima que release-please deriva. Gana un segundo propósito con este ADR
- ADR-008 Frontend Stack — monorepo pnpm workspaces; el contexto donde vive el versionado independiente
- ADR-004 Hosting — Render / Vercel / EAS; el CD que se separa por tag
- ADR-022 Ruta de Despliegue Mobile — EAS y distribución interna; define por qué `versionCode` importa y `runtimeVersion`/OTA se difiere
- ADR-011 Contrato-first OpenAPI — el semver de la API da versión explícita al contrato HTTP
- ADR-023 Topología de Despliegue — el CD por parte encaja en la evolución PaaS free-tier → multi-cliente
- ADR-021 Análisis de Seguridad en el Pipeline — el CI que se reparte por path sigue corriendo sus gates de seguridad por workspace
- ADR-029 Ambientes y Validación de Entorno — ADR hermano en tooling de proceso; misma pauta "se decide acá, se implementa en un change SDD"

---

*Fecha de decisión: 2026-07-27*
