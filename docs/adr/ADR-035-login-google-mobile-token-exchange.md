---
tags:
  - adr
  - fase-diseño
  - seguridad
  - autenticacion
  - mobile
proyecto: MoneyDiary
estado: ✅ Decidido
fecha_creacion: 2026-08-07
fecha_actualizacion: 2026-08-07
---

# ADR-035 — Login con Google en mobile: verificación nativa de `id_token` (M1)

## Estado

✅ **Decidido** — en `apps/mobile`, "Ingresar con Google" se implementa como **intercambio nativo de token** (M1): la app obtiene el `id_token` de Google directamente en el dispositivo con `expo-auth-session`, y un nuevo endpoint en `apps/api` lo verifica y responde con la misma sesión Bearer que ya emite el login por password. Implementación como change SDD aparte (`auth-google-login-mobile`), posterior al change web (`auth-google-login`).

---

## Contexto

ADR-034 decidió "Ingresar con Google" como flujo **OIDC Authorization Code + PKCE terminado en `apps/api`**, con UI solo en `/login` (web). El mismo día se amplió el alcance del feature a mobile, lo que obliga a resolver cómo un flujo pensado para navegador se traduce a una app nativa — y esa traducción resultó no ser trivial:

1. **Transporte de sesión en mobile (`auth-login-session`, Sprint 6):** mobile usa `Authorization: Bearer <token>` (SecureStore), no la cookie `md_session` — transporte dual por diseño, ya implementado en `apps/mobile/src/api/client.ts` (`LoginResponseDto`).
2. **`x-api-key` es fail-closed en todo `/api`:** `app.use('/api', createApiKeyMiddleware(env.API_KEY))` guarda cada ruta bajo `/api`, incluida cualquier variante de `/api/auth/google*`. El **navegador del sistema** (el que un flujo redirect estilo web necesitaría abrir en mobile) no puede adjuntar esa cabecera — no hay forma de inyectarla desde fuera de la app, a diferencia del proxy same-origin que la web usa en `app.moneydiary.cl`.
3. **El `redirect_uri` de ADR-034 es de dominio de app**, precisamente para que la cookie host-only `md_session` llegue al host correcto. Un flujo redirect en mobile que aterrizara en el dominio del API (para esquivar el punto 2) rompería esa misma garantía sin siquiera aplicar, porque mobile no usa cookie.
4. Verificado en la fase de diseño del change `auth-google-login` (§9, `openspec/changes/auth-google-login/design.md`): **cualquier variante que intente reusar el flujo redirect web en mobile** — eximir `/api/auth/google*` del api-key, montar rutas fuera de `/api`, o duplicar la terminación OIDC en dos superficies (una api-keyed, otra exenta) — o perfora el control fail-closed que `api-access-control` da por sentado, o rompe la garantía de la cookie host-only de ADR-034, o duplica la superficie del par de endpoints más sensible del código. Las tres son rechazadas por seguridad, no por preferencia.

En la práctica, el flujo de ADR-034 (redirect + cookie same-origin) es **viable solo en web**; mobile necesita su propio mecanismo.

## Decisión

Implementar el login con Google en mobile como **M1 — intercambio nativo de `id_token`**:

1. **`expo-auth-session`** ejecuta PKCE contra Google en el dispositivo, usando **client IDs nativos** (iOS/Android — clientes públicos, sin secreto embebido) y obtiene un `id_token` firmado por Google. El flujo OIDC **termina en el dispositivo**, no en `apps/api` — desviación explícita respecto a la decisión literal de ADR-034 (§Decisión: "termina en `apps/api`"); ver Consecuencias.
2. **Nuevo endpoint `POST /api/auth/google/token`**, protegido por `x-api-key` igual que el resto de `/api` (el cliente mobile ya lo envía en cada llamada). Recibe el `id_token`, lo verifica server-side — firma y claims (`iss`, `aud` contra los client IDs móviles, `exp`) contra el JWKS de Google — y responde con **el mismo cuerpo que `POST /api/auth/login`** (`{ token, userId, expiresAt }`, `LoginResponseDto`), que `apps/mobile/src/api/client.ts` ya sabe parsear y persistir en SecureStore vía `signIn(token)`.
3. **Reutilización de la resolución de identidad de ADR-034 sin cambios:** `LoginConGoogleUseCase` y el repositorio de identidad (`IIdentidadGoogleRepository`) se comparten entre web y mobile. Solo se agrega una **segunda implementación** del rol de verificación (`IVerificadorIdentidadExterna`) — un adapter que valida el `id_token` contra el JWKS de Google en vez de ejecutar el `authorizationCodeGrant` de `openid-client`. La política **find-only** (nunca `find-or-create`), la exclusión de usuarios demo, el gate de `email_verified === true` para vincular por primera vez, y el rechazo a re-vincular un `googleSub` distinto (regla ★) se heredan por construcción — no por convención repetida — porque ambos verificadores alimentan el mismo use case.
4. **Activación gateada igual que web:** el endpoint solo existe (deja de ser un 404 estructural) cuando las credenciales mobile (`GOOGLE_CLIENT_ID_IOS`/`GOOGLE_CLIENT_ID_ANDROID`) están presentes — mismo patrón de activación estructural de ADR-034 §Decisión-6/composición (`container.googleAuth` / grafo equivalente para mobile). El botón en mobile se oculta o muestra consultando el mismo endpoint de descubrimiento **`GET /api/auth/capabilities`** (`googleLoginEnabled`) que ya sirve a la web (design §4.5, AC-10) — una sola fuente de verdad de activación para ambos clientes.
5. **Sin `nonce` emitido por el servidor.** A diferencia del flujo web, el servidor no inicia el intercambio y no puede fijar un `nonce` para atarlo a la respuesta; el `id_token` recibido se valida por firma/claims/expiración, pero la ventana de replay queda acotada solo por `exp` (~1 hora) en vez de por el binding de `nonce`. Postura estándar para "backend que verifica un id_token entregado por el cliente" (documentada por Google), pero **estrictamente más débil** que el flujo web y se deja escrita, no diluida.
6. **Entrega como change SDD independiente** (`auth-google-login-mobile`), posterior al change web. No bloquea ni es bloqueado por el flujo web; requiere setup externo (client IDs iOS/Android en Google Cloud Console, build EAS para probar en dispositivo) que no es verificable en CI.

## Alternativas consideradas

- **M2 — flujo redirect terminado en el servidor + deep link de vuelta a la app** — rechazada: requiere que el navegador del sistema alcance `apps/api`, y toda forma de lograrlo es mala (ver Contexto, punto 4): eximir el api-key rompe `api-access-control`; mover las rutas fuera de `/api` rompe la garantía de cookie host-only de ADR-034 (y mobile ni siquiera usa cookie); duplicar la terminación OIDC dobla la superficie del endpoint más sensible del repo. Además exige un esquema de deep link, configuración EAS adicional y un **store de código de un solo uso** del lado servidor — el mismo estado server-side que la fase de diseño ya había descartado mantener en Render por costo operativo.
- **WebView embebido con las credenciales de Google** — rechazada: Google bloquea el flujo OAuth dentro de `WebView` embebidos (política anti-phishing de Google Identity), y aunque no lo bloqueara, un WebView controlado por la app es exactamente la superficie que esa política existe para prevenir (la app podría capturar credenciales).
- **Mobile se queda solo con password** (no ofrecer Google en mobile) — rechazada: el alcance del feature ya fue decidido como web **y** mobile (locked answer, MOB-05); reducir el alcance no es una opción de mecanismo, es revertir una decisión de producto ya tomada.

## Consecuencias

- **Desviación explícita de ADR-034.** La decisión literal de ADR-034 es un flujo OIDC "que termina en `apps/api`"; M1 termina en el dispositivo y reduce `apps/api` a verificador de un token ya emitido. Por eso esto es un ADR nuevo y no una nota al pie de ADR-034: es un modelo de confianza distinto (token client-supplied vs. servidor como parte activa del intercambio), con su propia revisión y sus propias consecuencias, no una variación menor del mismo diseño.
- **Nueva superficie de ataque server-side.** `POST /api/auth/google/token` es un endpoint nuevo, externamente alcanzable, que confía en un JWT provisto por el cliente — requiere su propia spec, su propio set de tests de integración (incluyendo `aud`/`iss`/`exp`/firma inválidos) y entra al fan-out de revisión de seguridad ya definido para hot paths de `**/auth/**`.
- **Configuración externa adicional.** Google Cloud Console necesita client IDs nativos (Android + iOS) sumados al client ID web de ADR-034 — tres identidades de cliente registradas para un mismo proyecto OAuth, cada una con su propio `aud` esperado en la verificación.
- **Ventana de replay más amplia que web** (ver Decisión, punto 5) — aceptada como el costo conocido de no poder emitir `nonce` desde un flujo que el servidor no inició; queda documentada para no perderse en una futura revisión.
- **Dependencia de secuencia, no de bloqueo:** el change `auth-google-login-mobile` reutiliza `LoginConGoogleUseCase` y `IIdentidadGoogleRepository` del change web (`auth-google-login`) tal cual quedan en `domain`/`application` — por eso se entrega después, aunque no dependa de artefactos web del lado `infrastructure`/UI.
- **No cambia nada del flujo web decidido en ADR-034**: cookie, sesión, `redirect_uri`, ni el botón de `/login`.
