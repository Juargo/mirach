# Mirach

Aplicación de finanzas personales que importa cartolas de bancos chilenos (Banco de Chile, BancoEstado, BCI y Santander) desde archivos `.xlsx` y `.pdf`, clasifica los movimientos y muestra un presupuesto **50/30/20** con un semáforo por bucket (Necesidades 50 %, Deseos 30 %, Ahorro 20 %).

Mirach continúa MoneyDiary como producto. Este repositorio conserva el API y la landing con su historial; las apps nativas para iPhone (Swift/SwiftUI) y Android (Kotlin/Compose) se construirán como clientes delgados generados desde el contrato OpenAPI. Las decisiones fundacionales están en [ADR-046](docs/adr/ADR-046-fundacion-mirach.md).

## Estructura

| Ruta | Contenido |
|---|---|
| `apps/api` | API Express + TypeScript + Prisma (`@mirach/api`). Contrato en `apps/api/openapi.json`. |
| `apps/landing` | Sitio estático en Astro (`@mirach/landing`). |
| `apps/ios`, `apps/android` | Previstas, fuera del workspace de pnpm. Aún no existen. |
| `docs/adr/` | Decisiones de arquitectura (ADRs). |
| `openspec/` | Especificaciones vigentes (proceso SDD). |

## Requisitos previos

- Node.js 22 (versión exacta en [`.node-version`](.node-version)).
- pnpm 11 (`corepack enable` activa la versión declarada en `package.json`).
- Docker, para la base de datos local de pruebas (alternativa con Homebrew en la guía enlazada abajo).

## Comandos

```bash
pnpm install                 # instala las dependencias
pnpm test                    # pruebas unitarias de todos los workspaces
pnpm build                   # build de todos los workspaces
pnpm lint                    # lint de todos los workspaces
pnpm api dev                 # API en http://localhost:3000
pnpm landing dev             # landing en modo desarrollo
```

Las pruebas de integración y e2e del API (`pnpm api test:integration`, `pnpm api test:e2e`) requieren una base de datos PostgreSQL local; ver [`apps/api/docs/local-test-db.md`](apps/api/docs/local-test-db.md).

## Documentación

- [`docs/adr/`](docs/adr/README.md): índice de decisiones de arquitectura.
- [`CLAUDE.md`](CLAUDE.md) y [`AGENTS.md`](AGENTS.md): guía de arquitectura y convenciones para agentes de código.

## Licencia

Por definir. El repositorio aún no incluye un archivo `LICENSE`.
