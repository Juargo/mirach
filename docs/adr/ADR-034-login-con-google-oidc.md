---
tags:
  - adr
  - fase-diseño
  - seguridad
  - autenticacion
proyecto: MoneyDiary
estado: ✅ Decidido
fecha_creacion: 2026-08-07
fecha_actualizacion: 2026-08-07
---

# ADR-034 — Login con Google (OIDC en el backend)

## Estado

✅ **Decidido** — se incorpora **"Ingresar con Google"** como método alternativo de login, implementado como flujo **OIDC Authorization Code + PKCE terminado en `apps/api`** con la librería **`openid-client`** (v6). **Solo ingreso, sin registro**: el login con Google autentica únicamente a usuarios ya existentes; si la identidad de Google no corresponde a un usuario, no se crea ninguno. En la UI, el botón aparece en `/login` debajo del formulario nativo de email + password, que se mantiene sin cambios. Implementación como change SDD aparte.

---

## Contexto

La autenticación actual (change `auth-login-session`, Sprint 6) es **email + password**:

- **Credenciales:** `passwordHash` (argon2id, `@node-rs/argon2`) en la tabla `User`; `email` cifrado a nivel de aplicación (AES-GCM, ADR-013) con `emailBlindIndex` (HMAC-SHA256) como clave real de lookup/unicidad.
- **Sesiones:** stateful en Postgres (`Session { tokenHash, expiresAt }`) — token opaco de 32 bytes en cookie `md_session` HttpOnly/`SameSite=Strict`/host-only; la BD guarda solo el SHA-256. TTL absoluto de 7 días. La web usa la cookie; mobile usa `Authorization: Bearer` (dual transport por diseño).
- **No existe registro**: no hay `POST /auth/register`; los usuarios se crean por seed o vía el flujo demo (`GET /api/auth/demo`), que ya resolvió el patrón de **navegación top-level** con guard Sec-Fetch (`esNavegacionDeNivelSuperior`) — el mismo que necesita un redirect OAuth.
- En el proposal de `auth-login-session`, **OAuth quedó como non-goal explícito**. Este ADR levanta esa deuda de forma acotada.

Restricciones vigentes que condicionan la solución:

1. **ADR-002:** toda la comunicación pasa por el backend — Supabase es solo el Postgres gestionado; el cliente no habla con servicios de identidad directamente.
2. **ADR-028:** el proyecto migró de NestJS a Express precisamente para aprender los fundamentos sin capas de magia; una abstracción opaca de auth iría contra ese objetivo.
3. **ADR-013:** el email es dato cifrado con blind index; cualquier email proveniente de Google debe pasar por el mismo pipeline (cifrado + HMAC) para lookup, nunca compararse en claro contra la BD.
4. **Producción:** la web vive en `app.moneydiary.cl` detrás de un proxy same-origin (`apps/web/api/proxy.ts`) que inyecta `x-api-key` server-side y releva las cabeceras Sec-Fetch; una navegación top-level del navegador a `/api/...` atraviesa el proxy igual que el flujo demo.

La motivación de producto: reducir la fricción de ingreso (recordar contraseña) ofreciendo la cuenta Google como credencial alternativa para los usuarios existentes.

## Decisión

Implementar **Sign in with Google** como flujo **OIDC Authorization Code + PKCE** que **termina en `apps/api`**:

1. **Librería `openid-client` (v6, panva).** Cliente OIDC certificado, sin framework: discovery del issuer de Google, generación de `code_verifier`/`code_challenge` (S256), `state`, `nonce`, y validación criptográfica del `id_token` (firma, `iss`, `aud`, `exp`) en `authorizationCodeGrant()`. Aporta el fundamento del protocolo sin esconder el flujo.
2. **Dos endpoints nuevos en `http-express`**, públicos a nivel de sesión (detrás del `apiKeyMiddleware`, como `login` y `demo`):
   - `GET /api/auth/google` — inicio: exige navegación top-level (guard Sec-Fetch, mismo patrón que el flujo demo), genera `state` + PKCE, los persiste en una cookie temporal HttpOnly de corta vida (aún no hay sesión) y responde 302 a `accounts.google.com`.
   - `GET /api/auth/google/callback` — retorno: valida `state` + PKCE + `id_token`, resuelve la identidad y emite sesión. El `redirect_uri` registrado apunta al dominio de la app (atraviesa el proxy same-origin), de modo que la cookie host-only sigue siendo válida.
3. **Identidad y vinculación (solo login, sin registro):**
   - `User` gana la columna **`googleSub String? @unique`** — el claim `sub` de Google (identificador estable y opaco del usuario en el IdP; no requiere cifrado ADR-013 por no ser PII legible, pero sí unicidad).
   - Lookup primario por `googleSub`. Si no hay match, **vinculación por primera vez**: se busca por `emailBlindIndex` **solo si `email_verified === true`** en el `id_token`; si existe el usuario (y no es demo), se persiste su `googleSub` y queda vinculado.
   - Si no existe ningún usuario para esa identidad, **no se crea nada**: redirect a `/login` con error genérico (sin revelar si el email existe — misma política anti-enumeración del login actual).
   - Los usuarios demo (`esDemo`) quedan excluidos de la vinculación.
4. **La sesión no cambia.** El callback emite exactamente la misma sesión que `LoginUseCase`: token opaco → SHA-256 en `Session`, cookie `md_session`, TTL de 7 días (`duracion-sesion.ts`). Google actúa solo como verificador de identidad; la autorización y el ciclo de vida de la sesión siguen siendo propios.
5. **Sin persistir tokens de Google.** No se guardan `access_token`/`refresh_token` — no se consumen APIs de Google, solo identidad. El `id_token` se valida y se descarta.
6. **Clean Architecture (ADR-005):** use case `LoginConGoogleUseCase` en application con un port para la verificación OIDC (p. ej. `IVerificadorIdentidadExterna`); `openid-client` vive en un adapter de infrastructure. Dominio y application no conocen a Google.
7. **UI (`apps/web`):** en `/login`, debajo del formulario nativo, un botón "Continuar con Google" que es un **`<a href>` de navegación top-level** a `GET /api/auth/google` (mismo patrón que el link demo de la landing) — no un `fetch`. El login por password se mantiene intacto. *(Alcance de esta sección: solo web. El mismo día se amplió el alcance del feature a mobile; su mecanismo es distinto — verificación nativa de `id_token`, no un flujo terminado en `apps/api` — y queda gobernado por **ADR-035**, sin alterar el flujo web decidido aquí.)*
8. **Secretos y ambientes (ADR-029):** `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` entran al schema Zod de `env.ts` (requeridos solo si el feature está habilitado); valores de producción en el dashboard de Render, nunca en el repo. Redirect URIs registradas por ambiente en Google Cloud Console.

## Alternativas consideradas

- **Supabase Auth** — rechazada: el cliente hablaría directo con Supabase (rompe la regla de ADR-002 de que todo pasa por el backend), introduce un JWT paralelo al modelo propio de sesiones stateful (dos fuentes de identidad conviviendo) y acopla la identidad al vendor justo cuando ADR-023 prevé evolución de topología.
- **Passport.js (`passport-google-oauth20`)** — rechazada: strategies, `serialize`/`deserialize` y estado implícito son exactamente la clase de magia que ADR-028 sacó del stack; además su modelo de sesión convive incómodo con la `Session` propia. `openid-client` da el protocolo sin el framework.
- **Google Identity Services en el cliente (One Tap / botón GIS)** — rechazada: mete el SDK de Google en el navegador y entrega un `id_token` emitido para el cliente que el backend debe re-validar; más superficie en el front, en tensión con ADR-024 (clientes delgados) y ADR-002. El flujo redirect por backend es más simple y auditable.
- **Proveedor de identidad gestionado (Auth0 / Clerk)** — rechazada: overkill para una app mono-usuario free-tier; costo, lock-in y una caja negra que impide el objetivo de aprendizaje.
- **Status quo (solo email + password)** — rechazada como única opción: la fricción de contraseña es real y la deuda de OAuth quedó explícitamente anotada al cerrar `auth-login-session`; sí se mantiene como método primario.

## Consecuencias

- **Menos fricción de ingreso** para usuarios existentes, sin tocar el mecanismo de sesión ni el aislamiento por `userId` (RNF-SEC-006).
- **Base para el registro futuro:** habilitar "registrarse con Google" más adelante es cambiar la política del callback de *find* a *find-or-create* (más onboarding de datos iniciales); el flujo OIDC, la columna `googleSub` y los endpoints ya quedan listos. Ese cambio requerirá su propia decisión de producto.
- **Alcance mobile separado (ADR-035):** el mismo día se decidió que el feature cubre también mobile, pero con un mecanismo distinto (verificación nativa de `id_token` vía `expo-auth-session`, no un flujo OIDC terminado en `apps/api`) — desviación material respecto a la decisión de este ADR, documentada como su propia decisión en **ADR-035** y entregada como change SDD separado (`auth-google-login-mobile`).
- **Validación en fase de diseño:** la fase de diseño del change SDD `auth-google-login` revisó esta decisión mediante revisión adversarial doble-ciego (3 rondas, aprobada) sin encontrar objeciones al flujo web aquí decidido, y agregó como detalle de implementación el endpoint de descubrimiento `GET /api/auth/capabilities` (AC-10) — permite a los clientes (web y, más adelante, mobile) saber si el botón debe mostrarse sin hardcodear el estado de activación en el bundle.
- **Nueva dependencia:** `openid-client` (sin build scripts nativos — compatible con la postura `pnpm approve-builds`).
- **Configuración externa nueva:** proyecto en Google Cloud Console (OAuth consent screen + client web + redirect URIs por ambiente). El flujo no es testeable end-to-end sin esas credenciales; los tests de integración usan un doble del port de verificación.
- **Superficie de seguridad nueva en `**/auth/**`:** el callback maneja entradas del exterior (query params de Google) — obliga `state` + PKCE + validación de `id_token` + guard Sec-Fetch, y hereda el rate-limiting por IP del patrón existente. Los reviews de PR sobre esta ruta disparan el fan-out completo de seguridad ya definido para hot paths de auth.
- **Modelo de datos:** migración aditiva (`googleSub` nullable + unique). `passwordHash` ya era nullable, así que un futuro usuario solo-Google encaja sin tocar el modelo.
- **Error UX:** el callback comunica fallos vía redirect a `/login?error=...` con mensaje genérico — sin enumeración de cuentas, consistente con la política de credenciales inválidas del login actual.
