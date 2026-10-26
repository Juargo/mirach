---
tipo: adr
proyecto: Mirach
estado: Aceptado
fecha: 2026-10-24
requisitos: [RNF-SEC-001, RNF-EXA-001, RNF-FIA-001, RNF-USA-006, RNF-ACC-002, PUB-04]
---

# ADR-007 — Stack tecnológico

## Estado

Aceptado (2026-10-25); propuesto el 2026-10-24. Todo el stack listado como vigente ya está en el repositorio. Los
proveedores de errores y suscripciones son **nuevos** y se deciden en ADR-011 y ADR-012.
Las versiones exactas viven en cada `package.json`, `project.yml` y `libs.versions.toml`;
aquí se registran la elección y su motivo.

## Contexto

Criterios de selección, en orden:

1. Seguridad y madurez: mantenido activamente, sin vulnerabilidades abiertas conocidas.
2. Que el desarrollador lo conozca o quiera aprender sus fundamentos (TypeScript, Node,
   PostgreSQL, Swift y Kotlin nativos), sin magia que los oculte.
3. Costo cero o bajo en la etapa de validación.
4. Que encaje con ADR-001 (monolito modular, clientes delgados, contrato generado).

## Decisión

### API (`apps/api`)

| Pieza | Elección | Motivo |
|-------|----------|--------|
| Runtime | Node.js 22 LTS | LTS vigente; la versión exacta en `.node-version` |
| Lenguaje | TypeScript 5.9, modo estricto | Tipos en el dominio del dinero; `tsc --noEmit` en CI |
| HTTP | Express 5 | Mínimo y explícito; se dejó NestJS porque sus decoradores e inyección ocultaban los fundamentos |
| Validación y contrato | Zod 4 + `zod-openapi` | Una sola definición valida en tiempo de ejecución y genera `openapi.json` |
| ORM y migraciones | Prisma 7 + adaptador `pg` | Tipos generados, migraciones versionadas |
| Excel | ExcelJS, solo `.xlsx` | SheetJS se descartó por vulnerabilidades sin parche en npm; el `.xls` antiguo se rechaza (IMP-01) |
| PDF | `pdfjs-dist`, build legacy | Extrae texto con posiciones; abre PDF con contraseña (IMP-11) |
| Identidad | `jose` (JWKS de Apple), `google-auth-library` (ID token de Google) | Verificación estándar de firmas; versiones fijadas exactas |
| Hash de contraseña (solo revisión) | `@node-rs/argon2` | Argon2id |
| Logs | Pino + `pino-http` | JSON estructurado con redacción (ADR-011) |
| Scripts | `tsx` | Sin configuración extra |
| Pruebas | Vitest + Supertest | Un solo runner para unidad, integración y e2e |

### App de iPhone (`apps/ios`)

| Pieza | Elección | Motivo |
|-------|----------|--------|
| Lenguaje y UI | Swift + SwiftUI | Nativo; decisión de producto |
| Mínimo | iOS 17 | Cubre la mayoría del parque en Chile y habilita APIs modernas de SwiftUI (PUB-04) |
| Proyecto | XcodeGen (`project.yml`); el `.xcodeproj` no se versiona | Diffs legibles en los PR |
| Cliente del API | `swift-openapi-generator` de Apple, código generado commiteado | Cliente desde el contrato |
| Sesión | Keychain | Almacenamiento seguro del sistema |
| Login | AuthenticationServices (Apple), Google Sign-In | Flujos nativos |
| Pruebas | XCTest y XCUITest | Herramientas del sistema |

### App de Android (`apps/android`)

| Pieza | Elección | Motivo |
|-------|----------|--------|
| Lenguaje y UI | Kotlin + Jetpack Compose, Material 3 como base | Nativo; decisión de producto |
| Mínimo y objetivo | `minSdk` 26, `targetSdk` 36 | Android 8 cubre casi todo el parque en Chile (PUB-04) |
| Build | Gradle con Kotlin DSL, catálogo de versiones, R8 en release | Estándar |
| Red | Retrofit + OkHttp + `kotlinx.serialization`, cliente generado desde el contrato | Estándar en Android |
| Sesión | Cifrada con llave del Android Keystore | Almacenamiento seguro del sistema |
| Login | Credential Manager + Google ID | API actual de Google |
| Pruebas | JUnit, `kotlinx-coroutines-test`, MockWebServer; Compose UI tests | Estándar |

### Diseño compartido

| Pieza | Elección |
|-------|----------|
| Diseño de pantallas | Figma (archivo "Mirach-UI") |
| Tokens | `design/tokens.json` → recursos generados para iOS y Android con scripts Node propios |
| Tipografía | Solo Inter, a empaquetar en ambas apps (hoy usan la fuente del sistema), con cifras tabulares (`tnum`) en montos y fechas y respetando el tamaño de fuente del sistema (RNF-ACC-002, RNF-USA-006). Geist Mono se retira (decisión del product owner, 2026-10-25) |

### Landing (`apps/landing`)

Astro estático con Tailwind 4, desplegado en Vercel bajo `mirachbudget.app`. Aloja la
política de privacidad, soporte y la solicitud de borrado de cuenta que exigen las tiendas.

### Infraestructura y herramientas

| Área | Elección |
|------|----------|
| Hosting | Render (API), Supabase (PostgreSQL), Vercel (landing) — ADR-002 |
| Monorepo | pnpm 11 workspaces para `api` y `landing`; `ios` y `android` fuera del workspace con su propia cadena |
| CI y releases | GitHub Actions, release-please, Dependabot — ADR-008 |
| Calidad local | Husky, lint-staged, commitlint, ESLint, Prettier |
| Seguridad en CI | `pnpm audit`, gitleaks, Semgrep, Schemathesis, OWASP ZAP — ADR-009 |
| Errores y crashes | Sentry, plan gratuito (**nuevo**, ADR-011) |
| Suscripciones | RevenueCat (**nuevo**, ADR-012) |

### Política de versiones

- Runtimes en versión LTS. `@types/node` fijado a la línea 22.
- `.npmrc` con `minimum-release-age=10080` (7 días): no se instala un paquete recién
  publicado. Lo mismo se aplica a mano en Gradle y Swift.
- Dependencias sensibles (identidad, criptografía) con versión exacta.
- Dependabot semanal; las versiones mayores se revisan una por una.

## Alternativas consideradas

| Alternativa | Por qué no |
|-------------|------------|
| NestJS | Usado antes; reemplazado por Express porque su magia tapaba los fundamentos que el proyecto busca aprender. |
| Fastify o Hono | Ventaja de rendimiento irrelevante con esta carga; migrar desde Express no aporta. |
| React Native / Expo o Flutter | Decisión de producto por apps nativas; además, la lógica no se comparte en cliente (ADR-001). |
| SheetJS | Vulnerabilidades sin parche en la versión de npm. |
| Jest | Vitest es más rápido y unifica todos los niveles de prueba del API. |

## Consecuencias

- Hay tres cadenas de build que mantener (Node, Xcode, Gradle) y la CI de iOS necesita
  runners macOS, que consumen más minutos.
- La política de "no instalar lo recién publicado" retrasa parches urgentes una semana; ante
  una vulnerabilidad crítica se hace una excepción explícita en el PR.

## Referencias

- ADR-001, ADR-002, ADR-008, ADR-009, ADR-011, ADR-012
- Serie anterior: ADR-006, ADR-007, ADR-009, ADR-016, ADR-025, ADR-028, ADR-032, ADR-033, ADR-048, ADR-052, ADR-053
