# Architecture Decision Records (ADRs)

This directory is the **source of truth** for MoneyDiary's architecture decisions.
Each ADR is a durable record: once accepted it is not rewritten, only superseded by a
later ADR that references it.

Migrated from the Obsidian vault (`02 Diseño/ADRs/`) so decisions live next to the code
they govern and are reviewed in the same PR that implements them.

## Convention

- One file per decision: `ADR-NNN-kebab-slug.md`.
- Status is one of: `Propuesto`, `Aceptado`, `Supersedido por ADR-XXX`, `Obsoleto`.
- Never edit an accepted ADR's decision. To change course, add a new ADR and set the old
  one's status to `Supersedido por ADR-XXX`.
- `CLAUDE.md` references ADRs by number (`ADR-028`); keep that mapping stable.

## Index

| ADR | Título | Estado |
|-----|--------|--------|
| [ADR-001](ADR-001-backend-framework.md) | Lenguaje y Framework Backend | ⛔ Supersedido por ADR-028 |
| [ADR-002](ADR-002-base-de-datos.md) | Base de Datos: PostgreSQL + Supabase + Prisma | ✅ Decidido |
| [ADR-003](ADR-003-frontend.md) | Frontend | ✅ Decidido |
| [ADR-004](ADR-004-hosting.md) | Hosting y Despliegue | ✅ Decidido |
| [ADR-005](ADR-005-monolito-modular-clean-architecture.md) | Empezar con Monolito Modular + Clean Architecture | Aceptado |
| [ADR-006](ADR-006-package-manager.md) | Package Manager: pnpm | ✅ Decidido |
| [ADR-007](ADR-007-libreria-parseo-excel.md) | Librería de Parseo Excel: ExcelJS + eliminación de soporte .xls | ✅ Decidido |
| [ADR-008](ADR-008-frontend-stack.md) | Frontend Stack (Estructura, Estilos, Estado, Routing) | ⚠️ Parcialmente reemplazado |
| [ADR-009](ADR-009-libreria-parseo-pdf.md) | Librería de Parseo PDF: pdfjs-dist (build legacy) para cartolas bancarias | ✅ Decidido |
| [ADR-010](ADR-010-app-mobile.md) | App Mobile: React Native + Expo (dev-client) + Expo Router + NativeWind | ✅ Decidido |
| [ADR-011](ADR-011-contrato-first-openapi.md) | Contrato-first con OpenAPI: `openapi.json` como fuente única de verdad | ✅ Decidido (mecanismo enmendado 2026-08-02: Zod, no NestJS) |
| [ADR-012](ADR-012-packages-api-client.md) | `packages/api-client`: cliente HTTP agnóstico de plataforma | ✅ Decidido (mecánica de origen desactualizada; paquete sin construir) |
| [ADR-013](ADR-013-cifrado-de-datos-en-reposo.md) | Cifrado de Datos en Reposo | ✅ Decidido |
| [ADR-014](ADR-014-tecnicas-de-validacion-de-requisitos.md) | Técnicas de Validación de Requisitos | ✅ Decidido |
| [ADR-015](ADR-015-tecnicas-de-verificacion-de-requisitos.md) | Técnicas de Verificación de Requisitos | ✅ Decidido |
| [ADR-016](ADR-016-testing-framework-vitest.md) | Testing Framework: migración de Jest a Vitest (backend + frontend) | ✅ Decidido |
| [ADR-017](ADR-017-testing-mobile.md) | Testing Mobile: Jest (jest-expo) + React Native Testing Library + Maestro (E2E) | ✅ Decidido |
| [ADR-018](ADR-018-testing-accesibilidad-y-ux.md) | Testing de Accesibilidad (a11y) + UX: pila por capas web y mobile | ✅ Decidido |
| [ADR-019](ADR-019-tracking-y-monitoring.md) | Tracking y Monitoring: SDKs de Sentry sobre backend compatible (GlitchTip) | 🔵 En discusión |
| [ADR-020](ADR-020-git-hooks-husky-monorepo.md) | Git Hooks en el monorepo: Husky + lint-staged + commitlint (config a nivel raíz) | ✅ Decidido |
| [ADR-021](ADR-021-analisis-de-seguridad-en-el-pipeline.md) | Análisis automatizado de seguridad en el pipeline (SCA + DAST + SAST + secretos) | ✅ Decidido |
| [ADR-022](ADR-022-ruta-de-despliegue-mobile.md) | Ruta de Despliegue Mobile: distribución interna (EAS) antes que store | ✅ Decidido |
| [ADR-023](ADR-023-topologia-de-despliegue.md) | Topología de Despliegue: actual (PaaS free tier, mono-usuario) y evolución hacia clientes | 🔵 En discusión |
| [ADR-024](ADR-024-arquitectura-de-clientes.md) | Arquitectura de Clientes: backend rico + clientes delgados contract-first | ✅ Decidido |
| [ADR-025](ADR-025-landing-page-con-astro.md) | Landing page: workspace propio `apps/landing` con Astro estático | ✅ Decidido |
| [ADR-026](ADR-026-ingesta-desde-mobile.md) | Ingesta desde mobile: la app gana una única capacidad de escritura (subir cartola), acotada | ✅ Decidido (regla de alcance supersedida por ADR-038; la capacidad de ingesta sigue vigente). `POST /api/ingestas` (one-shot) deprecado en US-057; eliminación física pendiente en US-061. Premisa "toda Transacción nace de una Ingesta" enmendada por ADR-039 (US-058) |
| [ADR-027](ADR-027-set-de-iconos-web-y-mobile.md) | Set de iconos unificado para web y mobile | ✅ Decidido |
| [ADR-028](ADR-028-migracion-backend-a-express.md) | Migración del Backend de NestJS a Express | ✅ Decidido |
| [ADR-029](ADR-029-ambientes-y-validacion-de-entorno.md) | Ambientes (Develop / Testing / Producción) y Validación de Entorno con Zod | ✅ Decidido |
| [ADR-030](ADR-030-versionado-y-automatizacion-de-releases.md) | Versionado Independiente por Paquete y Automatización de Releases con release-please | ✅ Decidido |
| [ADR-031](ADR-031-estrategia-de-ramas-github-flow.md) | Estrategia de Ramas: GitHub Flow (Trunk-Based) | ✅ Decidido |
| [ADR-032](ADR-032-runner-scripts-ts-node-a-tsx.md) | Runner de scripts TypeScript: `ts-node` → `tsx` | ✅ Decidido |
| [ADR-033](ADR-033-logging-estructurado-con-pino.md) | Logging Estructurado con Pino | ✅ Decidido |
| [ADR-034](ADR-034-login-con-google-oidc.md) | Login con Google: OIDC Authorization Code + PKCE terminado en el backend | ✅ Decidido (regla solo-ingreso supersedida por ADR-041; el resto vigente) |
| [ADR-035](ADR-035-login-google-mobile-token-exchange.md) | Login con Google en mobile: verificación nativa de `id_token` (M1) | ✅ Decidido (regla find-only supersedida por ADR-041; el resto vigente) |
| [ADR-036](ADR-036-catalogo-clasificacion-por-usuario.md) | Catálogo de clasificación por usuario (copy-on-signup): `Categoria`/`PatronClasificacion` dejan de ser globales | ✅ Decidido e implementado |
| [ADR-037](ADR-037-identidad-de-categoria-como-fila-del-usuario.md) | Identidad de categoría como fila del usuario: retiro del enum cerrado `Categoria` y de `CATEGORIA_BUCKET` | ✅ Decidido |
| [ADR-038](ADR-038-mobile-write-scope-configuracion.md) | Alcance de escritura de la app mobile: perfil propio y catálogo de clasificación (supersede la regla de alcance de ADR-026) | ✅ Decidido |
| [ADR-039](ADR-039-movimiento-manual-origen-sentinel.md) | Movimientos manuales: columna `origen`, cuenta centinela per-user y semántica de identidad de origen (enmienda premisa de ADR-026: una `Transaccion` ya no siempre nace de una `Ingesta`) | ✅ Decidido (ciclo de vida post-creación enmendado por ADR-040) |
| [ADR-040](ADR-040-correccion-de-movimientos-manuales.md) | Corrección de movimientos: la proveniencia determina la mutabilidad — `DELETE /api/movimientos/:id` solo para filas `origen='Manual'`, sin ventana de tiempo, solo web (enmienda ADR-039, reafirma ADR-038) | ✅ Decidido |
| [ADR-041](ADR-041-google-signup-on-first-login.md) | Login con Google crea la cuenta al primer ingreso: signup-on-first-login passwordless + catálogo en la misma transacción (supersede la regla "solo ingreso, sin registro" de ADR-034) | ✅ Decidido |
| [ADR-042](ADR-042-unicidad-de-categoria-por-bucket.md) | Unicidad de `Categoria` pasa de `(userId, nombre)` a `(userId, bucketId, nombre)`; el contrato de reclasificación identifica la categoría por `categoriaId`, corte duro (enmienda la cláusula de unicidad de ADR-036/037) | ✅ Decidido (PR1: contrato → `categoriaId`; PR4 entrega la migración de esquema y el gate bucket-scoped) |
