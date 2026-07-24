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

`.env.test` está gitignored (`.env.*`). Los scripts `test:*:local` lo cargan vía
`DOTENV_CONFIG_PATH=.env.test`; `dotenv` no pisa vars ya seteadas, así que solo aplica
lo de este archivo.

## 2. Levantar el Postgres local — elegí UN camino

### Opción A — Docker (recomendado, aislado y desechable)
Requiere Docker instalado (`brew install --cask docker` y abrir Docker Desktop una vez).
```bash
cd apps/api
docker compose up -d          # Postgres en localhost:5432
docker compose down           # apagar (conserva datos)
docker compose down -v        # apagar + BORRAR datos (reset limpio)
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
pnpm api test:integration:local   # repos Prisma contra la DB local
pnpm api test:e2e:local           # HTTP (createApp) contra la DB local
```

## Cómo leer los resultados

| Resultado | Significado |
|---|---|
| **Integration verde** | ✅ La capa de persistencia Express anda contra DB real. |
| **E2e sin sesión pasan** (health, 401s) | ✅ Cadena de auth Express OK end-to-end. |
| **E2e con sesión fallan** (401 donde esperan 200) | ⚠️ **Bit-rot pre-existente** (Sprint 6 no actualizó esos e2e para login), NO regresión de la migración. Necesitan que se les agregue el setup de login. |
| **500 en cualquier lado** | 🔴 Problema real de la capa Express — investigar. |

Los e2e bit-rotteados (mandan solo `x-api-key`, sin sesión) fallarán hasta que se les
agregue el flujo de login (`POST /api/auth/login` → cookie/Bearer) en su `beforeAll`.
Eso es deuda separada de la migración.
