# AGENTS.md

App de finanzas personales que importa cartolas bancarias chilenas (`.xlsx`, `.pdf`). Monorepo pnpm: `apps/api` (Express + Clean Architecture) y `apps/landing` (Astro). Las apps nativas (`apps/ios`, `apps/android`) vendrán después, fuera del workspace.

Lee `CLAUDE.md` para el contexto completo (arquitectura, ADRs, comandos, seguridad). `DESIGN.md` cubre el diseño visual de la landing. Este archivo solo lista lo que un agente haría mal por defecto.

## Comandos (desde la raíz)

Atajos: `pnpm api <x>` equivale a `pnpm --filter @mirach/api <x>`; `pnpm landing <x>`, a `pnpm --filter @mirach/landing <x>`.

```bash
pnpm api test                      # vitest unitario
pnpm api test -- -t "nombre"       # un test por nombre
pnpm api test -- ruta/al.spec.ts   # un archivo
pnpm api test:integration          # integración: muta BD real, exige ALLOW_DESTRUCTIVE_DB=1 y .env.test
pnpm api test:e2e                  # e2e: mismo gate
pnpm api exec tsc --noEmit         # typecheck del backend
pnpm api dev                       # API en :3000
pnpm api cli -- ./test/fixtures/movimientos-test.xlsx   # pipeline de ingesta sobre un archivo
pnpm api exec prisma migrate dev   # migraciones
pnpm landing build                 # build de la landing

pnpm test | pnpm build | pnpm lint # todos los workspaces
```

Las pruebas de integración y e2e necesitan una BD local: ver `apps/api/docs/local-test-db.md`.

## Reglas del backend (apps/api)

- Dirección de dependencias: `domain ← application ← infrastructure`. Nunca al revés.
- No lanzar excepciones en domain/application: devolver `Result<T,E>` (`src/shared/result.ts`).
- Nombres: domain/application en **español** (VOs, errores, use cases); infraestructura (routes, middleware, adapters) en **inglés**. Archivos en `kebab-case.ts`.
- Nuevo use case: dominio → application (ports + use case) → infrastructure, en ese orden.
- Excel: ExcelJS, solo `.xlsx` (ADR-007). Leer celdas con `cell.text`, **no** `String(cell.value)` (BCI usa richText).
- Dinero: `BigInt` exacto, nunca `float`. Todo repo que devuelve datos de usuario filtra por `userId` en el WHERE.
- Las piezas web del API (sesión por cookie, CORS, Sec-Fetch, modo demo, Google web OAuth) están dormidas (ADR-046): no las borres ni las actives en producción.
- `@types/node` fijado en `^22`; no subir a 24 (rompe los tipos de ExcelJS).

## Prisma

- Configuración en `apps/api/prisma.config.ts`; el datasource usa `DIRECT_URL ?? DATABASE_URL`. Requiere `apps/api/.env` (ignorado por git).
- No agregar `earlyAccess: true`: los tipos estables de Prisma 7 lo rechazan.

## Clientes

- Ningún cliente importa `apps/api/src/domain`. El contrato es `apps/api/openapi.json`; las apps nativas generan sus modelos desde él (ADR-046).

## Gotchas

- `.npmrc`: `minimum-release-age=10080` (cuarentena de 7 días) y `audit-level=high`. Una dependencia recién publicada puede ser rechazada.
- `pnpm-workspace.yaml` fija overrides y lista `allowBuilds`. Una instalación limpia puede requerir `pnpm approve-builds`.
- Resolución aislada de pnpm: cada `apps/*` declara sus dependencias directas. Un "Cannot find module X" que funciona en tests suele indicar una dependencia transitiva.
- Los archivos con nombre `... 2.ts` o `... 2.json` son duplicados de sincronización de iCloud: ignorarlos y no editarlos.
- Commits: Conventional Commits, sin atribución de IA.
