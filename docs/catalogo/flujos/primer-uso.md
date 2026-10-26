# Primer uso: bienvenida, inicio de sesión y onboarding

Entrar con Apple o Google, aceptar los términos al crear la cuenta y llegar al primer resultado en pocos pasos (PER-01).

## Pantallas

| N° | Pantalla | Figma | Requisitos | Alcance |
|---|---|---|---|---|
| 00 | Bienvenida | [`89:180`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=89-180) | AUTH-01, AUTH-02, AUTH-03 | v1.0 |
| 31 | Bienvenida · error de inicio de sesión | [`135:1005`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=135-1005) | AUTH-01, AUTH-02 | v1.0 |
| 01 | Ingreso mensual | [`3:60`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=3-60) | PER-01, PER-02 | v1.0 |
| 02 | Elegir perfil | [`3:63`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=3-63) | PER-03, PER-04 | v1.0 |
| 11 | Inicio · estado vacío | [`90:322`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=90-322) | VIS-07 | v1.0 |

El tercer paso del onboarding (primera cartola, se puede saltar) es el flujo [Subir una cartola](subir-cartola.md); el cuarto es el [Inicio](inicio-y-movimientos.md).

## Endpoints

| Método | Ruta | Cuándo se llama | Códigos relevantes |
|---|---|---|---|
| GET | `/api/auth/capabilities` | Al abrir la bienvenida (solo `x-api-key`) | 200, 401 |
| POST | `/api/auth/apple/token` | Tras autorizar con Apple | 200, 401, 404, 429 |
| POST | `/api/auth/google/token` | Tras autorizar con Google | 200, 401, 404, 429 |
| GET | `/api/auth/me` | Al iniciar la app con token guardado | 200, 401 |

El ingreso declarado, el perfil y la aceptación de términos todavía no tienen endpoint (ver [Pendiente en el API](#pendiente-en-el-api)).

## Acciones

| Acción | Endpoint | Cuerpo | Éxito | Fallo |
|---|---|---|---|---|
| Continuar con Apple | `POST /api/auth/apple/token` | `identityToken` (JWT de la autorización nativa), `nonce` (valor crudo; a Apple se le entrega su SHA-256 en hexadecimal), `nombre` (solo en la **primera** autorización; omitir o `null` después) | 200 `{token, userId, expiresAt}`: guardar la sesión; cuenta nueva → onboarding, cuenta existente → Inicio | 401 opaco: pantalla 31; 404 Apple no está activo: ocultar el botón y reconsultar capacidades; 429 «Demasiados intentos, intenta más tarde» |
| Continuar con Google | `POST /api/auth/google/token` | `idToken` (Google Sign-In nativo o Credential Manager) | 200 igual que Apple | 401, 404 y 429 igual que Apple |
| Cancelar la hoja del proveedor | Ninguno | — | Vuelve a la bienvenida sin mensaje (AUTH-01, AUTH-02) | — |
| Reintentar capacidades | `GET /api/auth/capabilities` | Solo `x-api-key` | Muestra los botones activos | Error de red: «Reintentar» |
| Declarar ingreso o saltar | Pendiente (#111) | — | Pasa a elegir perfil | — |
| Elegir perfil | Pendiente (#110) | — | Pasa a la primera cartola | — |

Visibilidad de los botones: «Continuar con Apple» si `appleLoginEnabled`, solo en iPhone (ADR-006); «Continuar con Google» si `googleLoginMobileEnabled`. `googleLoginEnabled` es el flujo web y no se usa. El 401 de los endpoints de token es opaco a propósito: la app no distingue token inválido de cuenta no resoluble.

## Estados

- **Cargando capacidades**: los botones no se muestran todavía.
- **Sin proveedores activos** (banderas en `false`): «El inicio de sesión no está disponible por ahora» con «Reintentar».
- **Autenticando**: botones deshabilitados con progreso; evita envíos dobles.
- **Error de inicio de sesión** (pantalla 31): solo ante una falla real (red o proveedor), confirma que no se creó ninguna cuenta.
- **Inicio vacío** (pantalla 11): sin datos, invita a subir la primera cartola y no muestra porcentajes vacíos.

## Navegación

- Entrada: arranque sin sesión o con sesión rechazada por `GET /api/auth/me`; cualquier 401 `SESION_INVALIDA`; cerrar sesión o eliminar la cuenta.
- Salida: onboarding (01 → 02 → [subir cartola](subir-cartola.md) o saltar) → [Inicio](inicio-y-movimientos.md).

## Pendiente en el API

- Brecha 11 (#110, #111): ingreso declarado y perfil de presupuesto.
- Brecha 12 (#112): aceptación versionada de términos y política al crear la cuenta (AUTH-03).

## Notas por plataforma

- iPhone: «Iniciar sesión con Apple» usa `AuthenticationServices`. Apple entrega el nombre solo la primera vez: hay que enviarlo en ese primer `POST`; si ese intento falla antes de llegar al API, el nombre se pierde y la persona lo corrige después. El correo puede ser un reenvío privado de Apple. El `nonce` se genera por intento. Los botones de Apple y Google tienen igual jerarquía visual.
- Android: Google con Credential Manager; no se ofrece Apple (ADR-006).
