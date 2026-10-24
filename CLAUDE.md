# Mirach — Contexto para Claude Code

## ¿Qué es este proyecto?

Mirach es una app de finanzas personales que importa cartolas de bancos chilenos (Banco de Chile, BancoEstado, BCI, Santander) desde archivos `.xlsx` y `.pdf`, clasifica los movimientos y muestra un presupuesto **50/30/20** con un semáforo por bucket (Necesidades, Deseos, Ahorro). Es la continuación como producto de MoneyDiary: de allí heredó el API, la landing y el historial de decisiones (la serie anterior de ADRs se retiró en el commit `0f33729`; ver `docs/adr/README.md`).

**Repositorio:** `Juargo/mirach`
**Stack:** Express + TypeScript strict en `apps/api` (ADR-007) · Prisma + PostgreSQL · Astro en `apps/landing`. Las versiones exactas están en cada `package.json`.
**Infraestructura:** propia de Mirach (ADR-002): base Supabase `mirach` en `us-east-1` y servicio Render `mirach-api` en Virginia (`https://mirach-api.onrender.com`), con `API_KEY` y `ENCRYPTION_KEY` propias. Render despliega `main` solo y **no corre migraciones**: una migración que agrega columnas se aplica antes de mergear; una que las elimina, después del deploy. El landing todavía no está desplegado. El dominio y el bundle identifier están por definir. Las URLs y dominios que aparecen en el código (`moneydiary.cl`) son residuos del despliegue anterior y no corresponden a infraestructura de Mirach.

---

## Estructura del repositorio

Monorepo `pnpm workspaces` (ADR-007). El workspace contiene solo:

- `apps/api` — `@mirach/api`: API Express + Clean Architecture. Su contrato es `apps/api/openapi.json`.
- `apps/landing` — `@mirach/landing`: sitio estático en Astro.

Además: `docs/adr/` (decisiones), `openspec/` (proceso SDD; solo `specs/` migró) y `odd/tasks/` (seguimiento de trabajo en curso).

**Apps nativas:** `apps/ios` (Swift/SwiftUI, primero) y `apps/android` (Kotlin/Compose, después; ADR-007). Viven en esas carpetas **fuera** del workspace de pnpm, con su propia cadena de build. Son clientes delgados: sus modelos y llamadas se generan desde `apps/api/openapi.json` (ADR-001, ADR-005).

---

## Arquitectura

**Backend — patrón:** Monolito Modular + Clean Architecture (ADR-001).
**Regla de dependencias:** `domain ← application ← infrastructure`. Nunca al revés.
**Manejo de errores:** `Result<T,E>` (en `apps/api/src/shared/result.ts`). Nunca lanzar excepciones en domain/application.
**Al implementar una funcionalidad del backend:** empezar por el dominio (value objects, errores), luego application (ports, use cases) y por último infrastructure.

**Capa HTTP (Express, ADR-005 y ADR-007):** los endpoints viven en `apps/api/src/infrastructure/http-express/`:

- `app.ts`: `createApp(container)`, sin `listen`.
- `middleware/`: `apiKeyMiddleware` → `sessionMiddleware` → `errorMiddleware`.
- `routes/*.routes.ts`: funciones `registrar*(router, useCase)` con inyección por closure.
- `server.ts`: entrypoint (`node dist/infrastructure/http-express/server`).

No hay decoradores ni módulos: el grafo se arma a mano en `composition/container.ts`. "Ruta pública" significa no montar el middleware. Los DTOs y helpers de auth independientes del framework están en `infrastructure/http/` (`dto/`, `multer-file-reader.adapter`, `auth/`). Toda referencia a controllers, `*.module.ts`, guards o decoradores de NestJS en ADRs y specs es anterior a la migración: hoy son `http-express/routes/`, `container.ts`, los middleware y `req.userId`.

**Piezas web del API, dormidas (ADR-005):** sesión por cookie, CORS, guard Sec-Fetch y el flujo web de Google OAuth se conservan con sus tests porque podría existir un administrador web más adelante. En producción deben permanecer **apagadas**: allowlist de CORS vacía, y sin variables de Google web. No las borres ni las reactives sin un ADR nuevo. El modo demo ya no existe: se eliminó por completo; no lo reintroduzcas.

**Clientes sin compartir dominio:** ningún cliente (landing o apps nativas) importa de `apps/api/src/domain`. El contrato es `apps/api/openapi.json` (ADR-005): los modelos Swift y Kotlin se generan desde él, y un cambio del contrato debe regenerar los clientes o romper el build. Los cálculos de negocio (clasificación, semáforo, 50/30/20) viven en el API; si una pantalla necesita uno nuevo, se agrega al API, no a la app.

---

## Decisiones técnicas clave (ADRs)

Las decisiones viven en `docs/adr/`, un archivo por ADR. Índices:

- [`docs/adr/README.md`](docs/adr/README.md): número, título y estado de cada ADR, y la tabla que relaciona la serie nueva con la anterior.

Los ADRs que cargan reglas vivas:

- **ADR-001**: regla de dependencias `domain ← application ← infrastructure` y clientes delgados.
- **ADR-009**: cifrado en reposo. `descripcion`, `numeroCuenta` y `email` van cifrados; la clave vive fuera de la BD.
- **ADR-005**: REST con contrato `openapi.json`, solo cambios aditivos dentro de `/api`.
- **ADR-004**: el catálogo de categorías es por usuario y su unicidad es `(userId, bucketId, nombre)`. La reclasificación identifica por `categoriaId`, nunca por nombre.
- `Categoria.icono` se valida contra la allowlist de `domain/value-objects/icono-categoria.ts`; las filas viejas quedan en `null` con fallback en el cliente.
- **ADR-006**: sesión opaca, identidad por `sub`, aislamiento por `userId` y derechos por plan verificados en el servidor.

---

## Notas técnicas por app (gotchas)

El conocimiento no obvio de cada app vive junto a ella y se carga al trabajar bajo ese directorio:

- `apps/api/CLAUDE.md`: parseo Excel y PDF, Prisma, dinero, semáforo, categorización, aislamiento multi-tenant, db-safety y cifrado, patrones de detección bancaria y fixtures.
- `apps/landing/CLAUDE.md`: Tailwind 4 CSS-first y excepción tipográfica.

---

## Comandos frecuentes

Desde la raíz: `pnpm api ...` equivale a `pnpm --filter @mirach/api ...`; `pnpm landing ...`, a `pnpm --filter @mirach/landing ...`. La lista completa de scripts está en el `package.json` de cada workspace; aquí los más usados y los restringidos:

```bash
pnpm install                    # Node 22 (.node-version) y pnpm 11
pnpm test | pnpm build | pnpm lint            # todos los workspaces
pnpm api dev                    # API en :3000 con recarga
pnpm api test                   # vitest unitario
pnpm api db:up                  # PostgreSQL local en Docker (ver apps/api/docs/local-test-db.md)
pnpm api test:db:setup          # migraciones + seed contra la BD local de pruebas
pnpm api test:integration       # vitest de integración: muta BD real, exige ALLOW_DESTRUCTIVE_DB=1 y .env.test
pnpm api test:e2e               # vitest e2e: mismo gate
pnpm api cli -- ./test/fixtures/movimientos-test.xlsx
pnpm api openapi:emit           # regenera apps/api/openapi.json
pnpm landing dev                # Astro en modo desarrollo
```

Checklist de CI para el API: lint, `tsc`, tests unitarios, `env:example:check`, `openapi:check`, integración/e2e contra Postgres efímero y build. `env:example:check`, `openapi:check` y `build` son los pasos que más se olvidan.

---

## Convenciones de código

- **Nombres en español** en domain y application (value objects, errores, use cases).
- **Nombres en inglés** en infraestructura (routes/handlers, middleware, adapters).
- **Archivos:** `kebab-case.ts`; clases `PascalCase`.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`), sin atribución de IA.
- **No lanzar excepciones** en domain/application: usar `Result.fail(error)`.
- **Ports** son interfaces en `application/ports/`; sus implementaciones, en `infrastructure/`.
- **Principios de diseño:** skills de proyecto en `.claude/skills/` (`solid`, `dry`, `kiss`, `yagni`). Aplicarlas al escribir código nuevo y al revisar.

---

## Plan de pruebas

El riesgo se concentra en el dinero y en el control de acceso, no en una cobertura homogénea:

- **Dinero con tipos exactos, nunca `float`.** Los tests de dominio cubren redondeo, decimales y signo ingreso/gasto del cálculo 50/30/20.
- **Aislamiento por `user_id`.** Todo endpoint que devuelve datos de usuario lleva un test de integración que verifica que un usuario no accede a datos de otro.
- **`CryptoService` (ADR-009)** se verifica aislado: cifra y descifra correctamente y la clave vive fuera de la BD.
- **Revisión por pares con checklist de seguridad fijo** antes de integrar: inyección, gestión de secretos, validación de entrada, no commitear claves.
- Los tests deben poder fallar: probar por mutación que el assert se pone rojo y que el test no está omitido.

---

## Notas de seguridad

- `pnpm-workspace.yaml` define `overrides` (por ejemplo `uuid`) y `packages: ['apps/*']`.
- `.npmrc` tiene `minimum-release-age=10080`, `audit-level=high` y `block-exotic-subdeps=true`. Un paquete recién publicado puede ser rechazado al instalar.
- SheetJS está descartado (CVEs sin parche en npm); se usa ExcelJS (ADR-007).
- `pnpm approve-builds` es necesario para `@prisma/engines`, `@swc/core`, `prisma` y `unrs-resolver` en una instalación limpia (declarado en `pnpm-workspace.yaml > allowBuilds`).
- **Secretos fuera del repo:** `API_KEY`, `DATABASE_URL`, `DIRECT_URL` y `ENCRYPTION_KEY` viven en el panel de cada servicio. Nunca copiar `.env` ni claves del repositorio anterior. Las apps nativas solo embeben la `x-api-key`, que se trata como pública: es un portero, no autenticación (ADR-006). Ningún otro secreto va en el binario y ningún endpoint usa la key para identificar a un usuario.
- `@types/node` en `apps/api` está fijado en `^22`; no subir a v24 (incompatibilidad de tipos con ExcelJS).
- pnpm usa resolución **aislada**: cada `apps/*` declara sus dependencias directas. Si aparece "Cannot find module X" pero X funciona en tests, probablemente es transitivo y hay que declararlo.
- Las migraciones de Prisma en producción se aplican de forma manual; setear solo `DATABASE_URL` puede migrar `localhost` en silencio.
