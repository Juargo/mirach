# Postgres local para tests e2e/integración (ADR-028)

Los tests `*.e2e-spec.ts` / `*.int-spec.ts` son **destructivos** (`deleteMany`, seed,
pipeline completo de ingesta) y corren contra la BD apuntada por `DIRECT_URL`/`DATABASE_URL`.
El gate `assertDestructiveDbAllowed` (`src/infrastructure/persistence/db-safety.ts`)
los **bloquea si la URL parece prod** (matchea `prod|production` o `supabase.co`).

MoneyDiary usa un único proyecto Supabase que **ES producción** — no hay dev/staging.
Por eso, para correr estos tests, se necesita un **Postgres local desechable** (URL en
`localhost`, sin "supabase"/"prod" → el gate la acepta).

## 1. Crear `.env.test`

El write directo de archivos `.env*` está restringido, así que creá `apps/api/.env.test`
a mano con este contenido (apunta al Postgres local; NO es secreto — DB local):

```dotenv
# DB local (coincide con docker-compose.yml). Sin "prod"/"supabase" → pasa el gate.
DATABASE_URL=postgresql://moneydiary:moneydiary@localhost:5432/moneydiary_test
DIRECT_URL=postgresql://moneydiary:moneydiary@localhost:5432/moneydiary_test

# Clave de cifrado de TEST (AES-256, ADR-013) — REQUERIDA desde US-034/035: el
# seed cifra descripcion/numeroCuenta/email y los tests descifran con ella, así
# que sin esto el seed falla ("runSeed requiere ENCRYPTION_KEY"). NO es secreta
# (DB local desechable). Generá la tuya con `openssl rand -base64 32`; si la
# cambiás, re-corré `pnpm api test:db:setup` (la clave del seed y la de los tests
# DEBEN coincidir, o el descifrado falla). La clave de blind index se DERIVA de
# esta, no es una var aparte. El valor de abajo es un PLACEHOLDER (no una clave
# válida): reemplazalo por tu propia salida de `openssl rand -base64 32`.
ENCRYPTION_KEY=REEMPLAZAR-por-openssl-rand-base64-32

# API key de TEST (no secreta; solo requiere >= 16 chars).
API_KEY=local-test-api-key-not-a-secret-000000000000000000000000000000
COOKIE_SECURE=false

# Rate limiter de login (defaults de render.yaml).
LOGIN_RATELIMIT_MAX_EMAIL=5
LOGIN_RATELIMIT_MAX_IP=20
LOGIN_RATELIMIT_WINDOW_MS=900000

# Credenciales del usuario fijo del seed (para los e2e de login).
SEED_USER_EMAIL=test@moneydiary.local
SEED_USER_PASSWORD=local-test-password-123
```

`.env.test` está gitignored (`.env.*`). Los scripts `test:e2e`/`test:integration` lo
cargan vía `DOTENV_CONFIG_PATH=.env.test`; `dotenv` no pisa vars ya seteadas, así que
solo aplica lo de este archivo.

> **Nota — `.env` de desarrollo (`pnpm api start`):** desde ADR-029, `env.ts` exige
> `DATABASE_URL`/`DIRECT_URL` en `localhost` cuando `NODE_ENV` es `development` o
> `test` (fail-fast: si tu `.env` de dev sigue apuntando al pooler de Supabase, la API
> ya NO arranca). Para desarrollar contra este mismo Postgres local, tu `apps/api/.env`
> necesita las mismas `DATABASE_URL`/`DIRECT_URL` de `localhost` que `.env.test` (podés
> copiar esas dos líneas). Si preferís seguir contra Supabase en dev, no hay vuelta:
> el gate lo bloquea — usá una DB local o corré con `NODE_ENV=production` (no
> recomendado fuera de Render).

## 2. Levantar el Postgres local — elegí UN camino

### Opción A — Docker (recomendado, aislado y desechable)
Requiere Docker instalado (`brew install --cask docker` y abrir Docker Desktop una vez).
Corré esto desde la raíz del repo (los scripts `pnpm api` ya resuelven el cwd a `apps/api`,
donde vive `docker-compose.yml`):
```bash
pnpm api db:up                 # = docker compose up -d — Postgres en localhost:5432
pnpm api db:down               # = docker compose down — apaga (conserva datos)
(cd apps/api && docker compose down -v)   # apagar + BORRAR datos (reset limpio; sin atajo pnpm)
```

### Opción B — Homebrew (sin Docker)
```bash
brew install postgresql@16
brew services start postgresql@16
# Crear el rol y la DB que espera la URL de .env.test:
createuser -s moneydiary
psql postgres -c "ALTER USER moneydiary WITH PASSWORD 'moneydiary';"
createdb -O moneydiary moneydiary_test
```
> Si el puerto 5432 ya está ocupado, cambialo en `docker-compose.yml` **y** en `.env.test`.

## 3. Migrar + seed (una vez, y tras cada `down -v`)

```bash
pnpm api test:db:setup        # = migrate deploy + seed, contra .env.test
```
`test:db:migrate` aplica todas las migraciones de `prisma/migrations/` al Postgres local;
`test:db:seed` corre `prisma/seed.ts` (usuario fijo + credenciales + 5 buckets + 8
categorías + patrones). Ambos usan el gate → exigen que la URL sea local, no prod.

## 4. Correr los tests

```bash
pnpm api test:integration   # repos Prisma contra la DB local
pnpm api test:e2e           # HTTP (createApp) contra la DB local
```
Ambos scripts ya cargan `DOTENV_CONFIG_PATH=.env.test` — no hay variantes `:local`
separadas (folded, ADR-029): al ser `test`/`development` fail-fast a `localhost`
(env.ts), correrlos sin `.env.test` no puede apuntar a Supabase por accidente.

## Cómo leer los resultados

> **Estado 2026-08-02:** con `.env.test` completo (incluyendo `ENCRYPTION_KEY`)
> la suite local pasa entera — **integración 52/52 y e2e 51/51**. La advertencia
> de bit-rot de abajo quedó como referencia histórica: los e2e con sesión ya
> fueron corregidos y hoy pasan. Si volvés a ver 401 donde se espera 200,
> tratalo como regresión, no como deuda conocida.

| Resultado | Significado |
|---|---|
| **Integration verde** | ✅ La capa de persistencia Express anda contra DB real. |
| **E2e sin sesión pasan** (health, 401s) | ✅ Cadena de auth Express OK end-to-end. |
| **E2e con sesión fallan** (401 donde esperan 200) | ⚠️ **Bit-rot pre-existente** (Sprint 6 no actualizó esos e2e para login), NO regresión de la migración. Necesitan que se les agregue el setup de login. |
| **500 en cualquier lado** | 🔴 Problema real de la capa Express — investigar. |

Los e2e bit-rotteados (mandan solo `x-api-key`, sin sesión) fallarán hasta que se les
agregue el flujo de login (`POST /api/auth/login` → cookie/Bearer) en su `beforeAll`.
Eso es deuda separada de la migración.

## Supervisión de prod — migración `Ingesta.userId` NOT NULL (US-004)

La migración `20260801000000_ingesta_userid_nullable_account_banco` agrega
`Ingesta.userId` NOT NULL vía backfill en dos fases (nullable → backfill desde
`Account.userId` → `SET NOT NULL`). El backfill es un `UPDATE ... FROM
"Account"` determinístico que corre DENTRO de la transacción de la migración
(no un script supervisado aparte como el de ADR-013) — pero antes de aplicar
esta migración contra Supabase (prod):

1. **Antes**: `SELECT count(*) FROM "Ingesta" WHERE "accountId" IS NULL;`
   debe ser `0` (invariante pre-migración: el schema actual exige `accountId`
   NOT NULL, así que esto es una tautología de verificación, no una
   expectativa incierta).
2. **Rehearsal recomendado** (precedente ADR-013): correr esta migración
   contra un snapshot/dump de prod ANTES del apply real, no confiar solo en
   el count check.
3. **Después**: `SELECT count(*) FROM "Ingesta" WHERE "userId" IS NULL;` debe
   ser `0` — si no lo es, el paso 3 de la migración (`SET NOT NULL`) ya
   habría fallado en seco (fail-closed), así que llegar a "después" con
   éxito ya lo garantiza; el check es documentación/paranoia adicional.
