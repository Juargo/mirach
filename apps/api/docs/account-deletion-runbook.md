# Eliminación de cuenta — runbook

`DELETE /api/cuenta` borra la cuenta del usuario autenticado y todos sus datos.
Lo exigen App Store (5.1.1(v)), Google Play y la Ley 21.719 (derecho de supresión,
vigente desde 2026-12-01).

## Contrato

- Requiere `x-api-key` + sesión válida (Bearer en las apps, cookie en la web) **y**
  el body `{ "confirmacion": "ELIMINAR" }` (valor exacto). Decisión del usuario,
  2026-10-04: sesión válida + confirmación explícita, sin exigir sesión reciente ni
  re-autenticación con el proveedor.
- `204` sin cuerpo: cuenta borrada; se limpia la cookie de sesión (inocuo para Bearer).
- `400 CONFIRMACION_INVALIDA`: confirmación ausente, distinta de `ELIMINAR`, de otro
  tipo o con campos extra en el body. No se borra nada.
- `401`: sin sesión (lo responde el middleware). El `userId` sale siempre de la sesión,
  nunca del body.
- Idempotencia: tras un borrado exitoso la sesión deja de existir, así que repetir la
  petición da `401` del middleware. Si el use case llegara a ejecutarse para un usuario
  ya inexistente, el borrado es un no-op exitoso.

## Qué se borra

Una sola transacción, acotada por `userId` (RNF-SEC-006), en este orden (respeta las FKs,
ninguna relación de `User` hace cascade):

`Session` (todos los dispositivos) → `Transaccion` (vía `Account.userId`) → `Ingesta`
→ `PatronClasificacion` → `Categoria` → `Account` → `User`.

`BucketPresupuesto` es catálogo global y no se toca. Si la transacción falla, no se borra nada.

## Revocación de identidad externa

Antes de borrar se llama al port `IRevocadorIdentidadExterna.revocar(userId)`: va
antes porque lo que necesita (el refresh token de Apple, `User.appleRefreshToken`, cifrado)
vive en las filas que el borrado destruye. Es best-effort: si falla se loguea un `warn`
atribuible (`userId` + motivo, nunca tokens) y el borrado continúa. ADR-049.

- **Con credenciales de Apple** (`AppleRevocadorIdentidadExterna`): descifra el token y llama a
  `POST https://appleid.apple.com/auth/revoke` con timeout de 5 s. Sin token guardado: `info` y sigue.
- **Sin credenciales**: no-op (`NoopRevocadorIdentidadExterna`).
- **Si el borrado falla después de revocar**: la petición da 500 y el usuario conserva la cuenta,
  pero su autorización de Apple ya está revocada. Al volver a entrar Apple le pide consentir de
  nuevo y el nuevo `authorizationCode` reemplaza el token guardado. Se acepta a propósito (ADR-049).

### Configuración en Render (T4)

Todas opcionales; sin ellas el login con Apple sigue funcionando y la revocación queda apagada.

| Variable | Valor |
| --- | --- |
| `APPLE_BUNDLE_ID` | ya existe (`app.mirachbudget.ios`), es el `client_id` |
| `APPLE_TEAM_ID` | Team ID de la cuenta Apple Developer |
| `APPLE_KEY_ID` | Key ID de la clave `.p8` de Sign in with Apple |
| `APPLE_PRIVATE_KEY` | contenido PEM de la `.p8` (secreto, `sync: false`; admite `\n` literales) |

Orden de despliegue: (1) aplicar la migración `20261006000000_add_apple_refresh_token` a
producción (aditiva; Render no corre `migrate deploy`), (2) mergear, (3) cargar las variables y
redeployar, (4) publicar la versión de la app que envía `authorizationCode`.

### Cómo verificar en vivo

1. Al arrancar, buscar en los logs de Render `apple-rest: canje del authorizationCode y
   revocación habilitados` (si dice `deshabilitados` o `incompleta`, falta alguna variable).
2. Iniciar sesión con Apple desde la app con el build nuevo. El canje corre en segundo plano
   justo después de responder el login; ningún fallo afecta al login. Buscar en los logs:
   - `canje del authorizationCode fallido` (Apple-side, con `motivo`): `invalid_grant` = el code
     venció (5 min) o ya se usó; `invalid_client` = Team ID, Key ID o `.p8` no coinciden;
     `timeout`/`red` = Apple no respondió.
   - `canje del authorizationCode descartado` con `motivo` `sub-no-coincide` o
     `id-token-invalido`: el code no pertenece a la identidad que inició sesión (o su
     `id_token` no verifica); no se guardó nada y el token emitido se revocó.
   - `no se pudo almacenar el refresh token de Apple` (con `errorName`): el canje salió bien
     pero falló el cifrado o la BD (revisar `ENCRYPTION_KEY` y la migración).
3. Eliminar la cuenta de prueba: debe aparecer `revocador-apple: token de Apple revocado`.
   En el dispositivo, Ajustes > Apple Account > Iniciar sesión con Apple ya no lista la app.

## Auditoría

Una línea `info` (`eliminar-cuenta: cuenta eliminada`) solo con `userId`.

## Fuera de alcance

La página web pública para solicitar la eliminación (requisito de Google Play, Data
safety) vive en la landing y se hace después.
