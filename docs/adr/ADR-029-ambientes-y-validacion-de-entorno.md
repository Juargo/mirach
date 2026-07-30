---
tags:
  - adr
  - fase-diseño
  - backend
  - infraestructura
proyecto: MoneyDiary
estado: ✅ Decidido
fecha_creacion: 2026-07-25
fecha_actualizacion: 2026-07-25
---

# ADR-029 — Ambientes (Develop / Testing / Producción) y Validación de Entorno con Zod

## Estado

✅ **Decidido** — se ratifican (a) la definición formal de los tres ambientes del proyecto gobernados por `NODE_ENV` y (b) la validación centralizada de variables de entorno con Zod en `apps/api`. La implementación se ejecutará como un change SDD aparte.

---

## Contexto

Hoy MoneyDiary **no tiene un concepto de "ambiente" de primera clase**. Lo que existe es una distinción implícita, disuelta en flags de entorno sueltos que cada módulo lee y parsea por su cuenta:

| Punto de decisión | Cómo decide hoy | Archivo |
|---|---|---|
| Conexión a la BD | `DIRECT_URL ?? DATABASE_URL` | `infrastructure/persistence/create-prisma-client.ts` |
| Flag `Secure` de la cookie | `NODE_ENV === 'production' \|\| COOKIE_SECURE === 'true'` | `infrastructure/http/auth/cookie.ts` |
| ¿La BD es producción? | heurística: host `*.supabase.co` ⇒ prod | `infrastructure/persistence/db-safety.ts` |
| Ops destructivas de BD | `ALLOW_DESTRUCTIVE_DB === '1'` | `infrastructure/persistence/db-safety.ts` |
| Rate limiter de login | 3 env propias, parseo fail-closed ad-hoc | `infrastructure/http/auth/login-rate-limiter.ts` |
| Carga de env | `dotenv/config` lee `.env`; los tests usan `DOTENV_CONFIG_PATH=.env.test` | `package.json`, `vitest.*.config.ts` |

Dos problemas concretos derivan de esto:

1. **No hay ambiente lógico único.** `NODE_ENV` se consulta en **un solo** lugar (`cookie.ts`). El resto son flags independientes que pueden quedar incoherentes entre sí (ej. `COOKIE_SECURE=true` con una BD local). Nadie garantiza que el conjunto de variables sea *coherente para un ambiente dado*.
2. **No hay validación centralizada.** Cada módulo hace su propio `process.env.X` con su propio parseo. Un env faltante o malformado se descubre **tarde** —a mitad de un request, o peor, en producción— en vez de al arrancar. No hay una única fuente de verdad de "qué variables necesita la app y con qué forma".

En infraestructura real hay **un solo proyecto Supabase, que ES producción**. No existe un Supabase de dev/staging. El desarrollo local y los tests usan un Postgres desechable en `localhost` (aún por provisionar — deuda registrada en ADR-028 Migración Backend a Express: los e2e/int están bloqueados justamente porque el `.env` apunta a prod y el gate `db-safety` los rechaza, correctamente).

La motivación primaria del proyecto es **aprender ingeniería de software** (declarada desde ADR-001 Backend Framework). La gestión de configuración por ambientes y la validación de entorno al boot son fundamentos que hoy están resueltos de forma frágil y merecen una decisión explícita.

---

## Opciones evaluadas

Este ADR resuelve tres preguntas acopladas.

### 1. ¿Qué es cada ambiente? — en particular, ¿qué es "Testing"?

- **Opción A — Testing = configuración + BD efímera (CI/local).** ✅ (elegida)
  Los tres ambientes son:
  - **development** — local, tu `.env`, Postgres local.
  - **test** — CI y local: Postgres desechable (docker/brew), donde corren e2e/integración. **No hay servidor deployado ni URL pública.**
  - **production** — Render + Supabase.

  ✅ Costo de infra nueva: **$0**. Desbloquea la deuda e2e/int de ADR-028 y habilita el DAST dirigido de ADR-021 Análisis de Seguridad en el Pipeline contra un entorno efímero (que ADR-021 ya exigía: *"nunca Supabase real"*).
  ❌ No hay un staging vivo para UAT/demo contra algo desplegado.

- **Opción B — Testing = staging deployado.**
  Un 2º servicio Render + 2º Supabase (o branch de Supabase).
  ✅ Ambiente vivo para UAT/demo/DAST contra un servidor real.
  ❌ Costo real en free tier, más superficie que mantener y asegurar. **Descartada por ahora** — sin necesidad multi-cliente todavía (ADR-023 Topología de Despliegue).

### 2. ¿Cómo se selecciona el ambiente?

- **Opción A — Status quo: flags sueltos.** Cada módulo decide con su propia env.
  ❌ Es el problema que este ADR viene a resolver. Incoherencia posible entre flags.

- **Opción B — `NODE_ENV` como fuente única, ∈ `{development, test, production}`.** ✅ (elegida)
  Una sola variable gobierna el ambiente lógico. Los flags derivados (Secure de cookie, la heurística Supabase-es-prod de `db-safety`, etc.) pasan a **derivarse** del ambiente, no a decidirse por separado.
  ✅ Mapeo 1:1 con "Develop / Testing / Producción". Ya está parcialmente en uso (`cookie.ts`) y Vitest ya setea `NODE_ENV=test` solo. Mínima fricción.

- **Opción C — `APP_ENV` (lógico) separado de `NODE_ENV` (runtime/toolchain).**
  Patrón común cuando existe un **staging deployado** donde conviene `NODE_ENV=production` (optimizaciones de build) pero `APP_ENV=staging` (otra BD).
  ❌ **YAGNI en este proyecto**: la Opción A de la pregunta 1 (testing efímero, sin staging) elimina el único caso de uso que justificaría dos variables. Serían dos flags a mantener coherentes para cero beneficio. **Descartada.**

### 3. ¿Cómo se validan las variables de entorno?

- **Opción A — Status quo: `process.env.X` disperso, parseo ad-hoc.**
  ❌ Sin fuente única del contrato de env. Errores se descubren tarde (runtime), no al boot.

- **Opción B — Zod, en un único módulo `config/env.ts`, validado una vez al boot (fail-fast).** ✅ (elegida)
  Un solo schema describe **todas** las variables que la app necesita y su forma. Se parsea **una vez al arrancar**: si falta o está malformada una variable, **la API no arranca** (en vez de explotar en un request). El schema es la única fuente de verdad del contrato de entorno, y puede tener **reglas condicionales por ambiente** (ver Decisión propuesta).
  ✅ Reemplaza los parseos ad-hoc (rate limiter, api-key, db-safety) por un punto central y tipado.
  ⚠️ Zod es **dependencia nueva** (no está en ningún workspace hoy).

- **Opción C — Validación a mano en TypeScript / `envalid` / `@t3-oss/env`.**
  ✅ TS puro no agrega dependencia; `envalid`/`t3-env` son alternativas específicas.
  ❌ TS puro reimplementa lo que Zod ya hace bien (coerción, mensajes, refinamientos). Las libs específicas son más opinadas y menos reutilizables que Zod, que además sirve para validar DTOs de entrada HTTP a futuro. **Zod gana por reutilización.**

---

## Decisión

1. **Formalizar tres ambientes**, gobernados por **`NODE_ENV` ∈ `{development, test, production}`** como **fuente única** del ambiente lógico. Se descarta una variable `APP_ENV` separada (YAGNI, no hay staging deployado).

2. **Testing = configuración + BD efímera**, sin servidor deployado. `development` y `test` usan Postgres local (`localhost`); `production` usa Supabase vía Render.

3. **Introducir Zod** para validar el entorno en un único módulo **`apps/api/src/config/env.ts`** (capa de **infraestructura**). Valida `process.env` **una vez, al boot, fail-fast**, y expone un objeto tipado e inmutable. Reemplaza los `process.env.X` dispersos.

4. **El schema Zod aplica reglas condicionales por ambiente**, endureciendo lo que hoy hace la heurística frágil de `db-safety`. Por ejemplo:
   - `production` ⇒ `COOKIE_SECURE` obligatorio en `true`; la cadena de BD **debe** ser Supabase; `ALLOW_DESTRUCTIVE_DB` **prohibido**.
   - `test` ⇒ la cadena de BD **debe** ser `localhost` (defensa en profundidad: imposible correr destructivos contra prod por config).
   - `development` ⇒ BD `localhost`, `Secure` opcional (permite HTTP local).

5. **Respeta ADR-005 Monolito-Modular-Clean-Architecture.** `config/env.ts` es infraestructura: `domain/` y `application/` **no lo importan**. Los valores validados se inyectan por DI desde `composition/container.ts`. El aislamiento del core se mantiene.

6. **Scope: solo `apps/api` en esta iteración.** El frontend (`apps/web`, Vite / `import.meta.env`) y mobile (`apps/mobile`, Expo / `EXPO_PUBLIC_*`) tienen su propio mecanismo de env de build. Este ADR **fija la política** (tres ambientes, validación al boot) pero **no implementa** su validación ahora — se evalúa en un ADR/change posterior para no inflar el alcance.

7. **El `.env.example` versionado se deriva del schema Zod, no se mantiene a mano.** Con el schema como fuente única del contrato de entorno, mantener el ejemplo por separado garantiza que tarde o temprano diverjan. Se genera desde el schema (un script `env:example` que emite el archivo con claves, tipos y defaults documentados) y un check en CI falla si el `.env.example` versionado no coincide con lo que el schema produce. El `.env.example` deja de ser una decisión editorial y pasa a ser un artefacto derivado —siempre en sync con lo que la app realmente exige.

---

## Consecuencias

**Positivas:**
- **Un ambiente coherente y explícito.** `NODE_ENV` gobierna; se acaban los flags sueltos que podían quedar incoherentes.
- **Fallo temprano y legible.** Un env faltante/malformado detiene el **arranque** con un mensaje claro, no un request a medias en producción.
- **Fuente única del contrato de entorno.** El schema Zod documenta —y hace cumplir— qué variables necesita la app. El `.env.example` deja de ser un artefacto editable a mano (y por tanto desactualizable) y pasa a **derivarse** del schema, siempre en sync con lo que la app exige.
- **`db-safety` se refuerza vía tipos.** La regla "test ⇒ localhost / prod ⇒ Supabase" pasa a vivir en el schema, no solo en una heurística de regex.
- **Desbloquea la deuda e2e/int** de ADR-028: con `test` formalizado apuntando a Postgres local, los tests destructivos corren seguros contra una BD desechable.

**A tener en cuenta:**
- **Nueva dependencia (Zod).** Sujeta a la política de seguridad del repo (`minimum-release-age`, `audit-level=high`). Fijar versión en el SDD, verificando doc vigente (Context7).
- **Refactor de los puntos de lectura actuales.** `create-prisma-client.ts`, `cookie.ts`, `db-safety.ts` y `login-rate-limiter.ts` dejan de leer `process.env` directo y pasan a consumir el env validado por DI. Es superficie acotada pero toca seguridad (cookie, db-safety) → re-correr el checklist de ADR-015 Técnicas de Verificación de Requisitos.
- **Provisionar el Postgres local.** El ambiente `test` exige tener la BD desechable levantada (docker-compose / brew) — tarea previa a desbloquear los e2e/int. Tooling ya esbozado en `apps/api/docs/local-test-db.md` (ADR-028).
- **Coherencia con Render.** Producción debe setear `NODE_ENV=production` explícitamente en el `render.yaml`/dashboard; el schema lo exigirá. Secretos siguen fuera del repo (ADR-013 Cifrado de Datos en Reposo, `sync:false`).
- **`.env.example` derivado exige tooling.** Hay que escribir el script generador (`env:example`) y el check de CI que detecta divergencia. Es superficie chica, pero el ejemplo deja de editarse a mano: cambiar una variable implica tocar el schema y regenerar.
- **Web/mobile quedan fuera por ahora.** Su validación de env es trabajo futuro; hasta entonces conservan su mecanismo actual.

---

## Referencias

- ADR-028 Migración Backend a Express — introdujo `create-prisma-client.ts` y `db-safety.ts`; su deuda e2e/int (bloqueada por `.env`→prod) es lo que este ADR desbloquea al formalizar `test`
- ADR-005 Monolito-Modular-Clean-Architecture — `config/env.ts` es infraestructura; el core no lo importa, recibe valores por DI
- ADR-002 Base de Datos — Supabase/Postgres; la selección de cadena de conexión pasa a derivar del ambiente
- ADR-004 Hosting — Render inyecta `NODE_ENV`/secretos en producción
- ADR-021 Análisis de Seguridad en el Pipeline — el DAST dirigido corre contra el entorno efímero de `test`, nunca Supabase real
- ADR-023 Topología de Despliegue — la opción "staging deployado" queda diferida hasta que haya necesidad multi-cliente
- ADR-013 Cifrado de Datos en Reposo — secretos de producción fuera del repo
- ADR-015 Técnicas de Verificación de Requisitos — re-correr el checklist de acceso/seguridad tras refactorizar cookie/db-safety

---

*Fecha de decisión: 2026-07-25*
