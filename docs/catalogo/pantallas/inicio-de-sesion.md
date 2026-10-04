# Inicio de sesión

## Propósito

Autenticar a la persona con su cuenta de Apple o de Google y abrir una sesión con token Bearer. No hay correo ni contraseña (ver «Fuera» en el [índice](../README.md#fuera)).

## Datos que muestra

| Dato | Origen | Formato |
|---|---|---|
| Botón «Continuar con Apple» | `GET /api/auth/capabilities` → `appleLoginEnabled` | Visible solo si es `true` |
| Botón «Continuar con Google» | `GET /api/auth/capabilities` → `googleLoginMobileEnabled` | Visible solo si es `true`. `googleLoginEnabled` es el flujo web y no se usa |
| Mensaje de error del intento | Copia propia de la app según el código HTTP | Texto breve bajo los botones |

## Acciones

| Acción | Endpoint | Cuerpo | Éxito | Fallo |
|---|---|---|---|---|
| Continuar con Apple | `POST /api/auth/apple/token` | `identityToken` (JWT de la autorización nativa), `nonce` (valor crudo; a Apple se le entrega su SHA-256 en hexadecimal), `nombre` (solo en la **primera** autorización de Apple; omitir o `null` después) | 200 `{token, userId, expiresAt}`: guardar sesión y abrir el Resumen | 401 «No se pudo iniciar sesión»; 404 Apple no está activo, ocultar el botón y reconsultar capacidades; 429 «Demasiados intentos, intenta más tarde» |
| Continuar con Google | `POST /api/auth/google/token` | `idToken` (de Google Sign-In nativo) | 200 igual que Apple | 401, 404 y 429 igual que Apple |
| Reintentar capacidades | `GET /api/auth/capabilities` | Solo `x-api-key` | Muestra los botones activos | Error de red o 401: «Reintentar» |

El 401 de los dos endpoints de token es opaco a propósito (no revela la causa): la app no distingue entre token inválido y cuenta no resoluble.

## Endpoints

| Método | Ruta | Cuándo se llama | Códigos relevantes |
|---|---|---|---|
| GET | `/api/auth/capabilities` | Al abrir la pantalla | 200, 401 |
| POST | `/api/auth/apple/token` | Tras autorizar con Apple | 200, 401, 404, 429 |
| POST | `/api/auth/google/token` | Tras autorizar con Google | 200, 401, 404, 429 |
| GET | `/api/auth/me` | Al iniciar la app con token guardado (validación de sesión) | 200, 401 |

`GET /api/auth/capabilities` y los dos endpoints de token se llaman solo con `x-api-key`: todavía no hay sesión.

## Estados

- **Cargando capacidades**: indicador; los botones no se muestran todavía.
- **Listo**: botones de los proveedores activos.
- **Sin proveedores activos** (ambas banderas `false`): «El inicio de sesión no está disponible por ahora» con «Reintentar». Es el estado vacío.
- **Error de capacidades**: mensaje de conexión con «Reintentar»; no se asume ningún proveedor.
- **Autenticando**: los botones se deshabilitan y se muestra progreso; evita envíos dobles.
- **Error de autenticación**: mensaje según el código (401, 429, red) y los botones vuelven a estar disponibles. Cancelar la hoja de Apple o de Google no es un error: no se llama al API ni se muestra mensaje.
- **Éxito**: sesión guardada y paso al Resumen.

## Navegación

- Entrada: arranque de la app sin sesión o con sesión rechazada por `GET /api/auth/me`; cualquier 401 posterior; cerrar sesión o eliminar la cuenta desde [Perfil](perfil.md).
- Salida: [Resumen del mes](resumen-del-mes.md) al autenticar.

## Notas para iPhone

- «Iniciar sesión con Apple» usa la hoja nativa de `AuthenticationServices`. Se pide nombre y correo; Apple entrega el nombre solo la primera vez, por lo que hay que enviarlo en ese primer `POST`. Si ese primer intento falla antes de llegar al API, el nombre se pierde: el API usa un nombre por defecto y la persona puede corregirlo en [Perfil](perfil.md).
- El correo puede ser una dirección de reenvío privado de Apple; la app no lo trata como dato visible clave.
- El `nonce` se genera por intento y no se reutiliza.
- Un botón de Apple y uno de Google deben tener igual jerarquía visual (guías de Apple para inicio de sesión de terceros).
- El token se guarda en el Keychain.

## Referencia

- Expo: `apps/mobile/app/login.tsx`, `apps/mobile/src/components/LoginScreen.tsx`, `apps/mobile/src/components/GoogleLoginButton.tsx` (solo el botón de Google; el resto es correo y contraseña, fuera de la v1).
- Web: `apps/web/src/routes/login.tsx`, `apps/web/src/components/LoginForm.tsx`.
