# Mirach — Contexto para Claude Code

## ¿Qué es este proyecto?

Mirach es una app de finanzas personales que importa cartolas de bancos chilenos (Banco de Chile, BancoEstado, BCI, Santander) desde archivos `.xlsx` y `.pdf`, clasifica los movimientos y muestra un presupuesto **50/30/20** con un semáforo por bucket (Necesidades, Deseos, Ahorro). Es la continuación como producto de MoneyDiary: de allí heredó el API, la landing y el historial de decisiones (ADR-046).

**Repositorio:** `Juargo/mirach`
**Stack:** Express + TypeScript strict en `apps/api` (ADR-028) · Prisma + PostgreSQL · Astro en `apps/landing`. Las versiones exactas están en cada `package.json`.
**Infraestructura:** aún no está aprovisionada (Supabase, Render y Vercel nuevos, con `API_KEY` y `ENCRYPTION_KEY` propias; ADR-046, D2). El dominio y el bundle identifier están por definir. Las URLs y dominios que aparecen en el código (`moneydiary.cl`) son residuos del despliegue anterior y no corresponden a infraestructura de Mirach.

---

## Estructura del repositorio

Monorepo `pnpm workspaces` (ADR-006). El workspace contiene solo:

- `apps/api` — `@mirach/api`: API Express + Clean Architecture. Su contrato es `apps/api/openapi.json`.
- `apps/landing` — `@mirach/landing`: sitio estático en Astro.

Además: `docs/adr/` (decisiones), `openspec/` (proceso SDD; solo `specs/` migró) y `odd/tasks/` (seguimiento de trabajo en curso).

**Apps nativas (aún no existen):** `apps/ios` (Swift/SwiftUI, primero) y `apps/android` (Kotlin/Compose, después). Vivirán en esas carpetas pero **fuera** del workspace de pnpm, con su propia cadena de build. Son clientes delgados: sus modelos y llamadas se generan desde `apps/api/openapi.json` (ADR-046, D1, D8, D9).

---

## Arquitectura

**Backend — patrón:** Monolito Modular + Clean Architecture (ADR-005).
**Regla de dependencias:** `domain ← application ← infrastructure`. Nunca al revés.
**Manejo de errores:** `Result<T,E>` (en `apps/api/src/shared/result.ts`). Nunca lanzar excepciones en domain/application.
**Al implementar una funcionalidad del backend:** empezar por el dominio (value objects, errores), luego application (ports, use cases) y por último infrastructure.

**Capa HTTP (Express, ADR-028):** los endpoints viven en `apps/api/src/infrastructure/http-express/`:

- `app.ts`: `createApp(container)`, sin `listen`.
- `middleware/`: `apiKeyMiddleware` → `sessionMiddleware` → `errorMiddleware`.
- `routes/*.routes.ts`: funciones `registrar*(router, useCase)` con inyección por closure.
- `server.ts`: entrypoint (`node dist/infrastructure/http-express/server`).

No hay decoradores ni módulos: el grafo se arma a mano en `composition/container.ts`. "Ruta pública" significa no montar el middleware. Los DTOs y helpers de auth independientes del framework están en `infrastructure/http/` (`dto/`, `multer-file-reader.adapter`, `auth/`). Toda referencia a controllers, `*.module.ts`, guards o decoradores de NestJS en ADRs y specs es anterior a la migración: hoy son `http-express/routes/`, `container.ts`, los middleware y `req.userId`.

**Piezas web del API, dormidas (ADR-046, D5):** sesión por cookie, CORS, guard Sec-Fetch, modo demo y el flujo web de Google OAuth se conservan con sus tests porque podría existir un administrador web más adelante. En producción deben permanecer **apagadas**: allowlist de CORS vacía, sin variables de Google web y sin habilitar el modo demo. No las borres ni las reactives sin un ADR nuevo.

**Clientes sin compartir dominio:** ningún cliente (landing o apps nativas) importa de `apps/api/src/domain`. El contrato es `apps/api/openapi.json` (ADR-011): los modelos Swift y Kotlin se generan desde él, y un cambio del contrato debe regenerar los clientes o romper el build. Los cálculos de negocio (clasificación, semáforo, 50/30/20) viven en el API; si una pantalla necesita uno nuevo, se agrega al API, no a la app.

---

## Decisiones técnicas clave (ADRs)

Las decisiones viven en `docs/adr/`, un archivo por ADR. Índices:

- [`docs/adr/README.md`](docs/adr/README.md): número, título y estado de cada ADR. Los marcados `Histórico` se conservan como historia y ya no rigen el código de Mirach.
- [`docs/adr/estado-implementacion.md`](docs/adr/estado-implementacion.md): resumen de una línea con el estado real de implementación.

Los ADRs que cargan reglas vivas:

- **ADR-005**: regla de dependencias `domain ← application ← infrastructure`.
- **ADR-013**: cifrado en reposo. `descripcion`, `numeroCuenta` y `email` van cifrados; la clave vive fuera de la BD.
- **ADR-028**: la capa HTTP es Express; ver `## Arquitectura`.
- **ADR-036 / ADR-042**: el catálogo de categorías es por usuario y su unicidad es `(userId, bucketId, nombre)`. La reclasificación identifica por `categoriaId`, nunca por nombre.
- **ADR-045**: `Categoria.icono` se valida contra la allowlist de `domain/value-objects/icono-categoria.ts`; las filas viejas quedan en `null` con fallback en el cliente.
- **ADR-046**: fundación de Mirach (apps nativas, infraestructura propia, scope `@mirach/*`, piezas web dormidas, clientes delgados). Marca qué ADRs previos pasan a ser históricos.

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
- **`CryptoService` (ADR-013)** se verifica aislado: cifra y descifra correctamente y la clave vive fuera de la BD.
- **Revisión por pares con checklist de seguridad fijo** antes de integrar: inyección, gestión de secretos, validación de entrada, no commitear claves.
- Los tests deben poder fallar: probar por mutación que el assert se pone rojo y que el test no está omitido.

---

## Notas de seguridad

- `pnpm-workspace.yaml` define `overrides` (por ejemplo `uuid`) y `packages: ['apps/*']`.
- `.npmrc` tiene `minimum-release-age=10080`, `audit-level=high` y `block-exotic-subdeps=true`. Un paquete recién publicado puede ser rechazado al instalar.
- SheetJS está descartado (CVEs sin parche en npm); se usa ExcelJS (ADR-007).
- `pnpm approve-builds` es necesario para `@prisma/engines`, `@swc/core`, `prisma` y `unrs-resolver` en una instalación limpia (declarado en `pnpm-workspace.yaml > allowBuilds`).
- **Secretos fuera del repo:** `API_KEY`, `DATABASE_URL`, `DIRECT_URL` y `ENCRYPTION_KEY` viven en el panel de cada servicio. Nunca copiar `.env` ni claves del repositorio anterior. Las apps nativas no llevan secretos embebidos en el binario.
- `@types/node` en `apps/api` está fijado en `^22`; no subir a v24 (incompatibilidad de tipos con ExcelJS).
- pnpm usa resolución **aislada**: cada `apps/*` declara sus dependencias directas. Si aparece "Cannot find module X" pero X funciona en tests, probablemente es transitivo y hay que declararlo.
- Las migraciones de Prisma en producción se aplican de forma manual; setear solo `DATABASE_URL` puede migrar `localhost` en silencio.
