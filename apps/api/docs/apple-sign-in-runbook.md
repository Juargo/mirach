# Runbook — Activación de "Iniciar sesión con Apple" en la API

Lado API de Sign in with Apple (plan fase 5, T3). El código queda **inerte**
hasta configurar `APPLE_BUNDLE_ID`: sin la variable, `POST /api/auth/apple/token`
responde 404 y `GET /api/auth/capabilities` reporta `appleLoginEnabled: false`.
No requiere secretos: validar un identity token usa solo las claves públicas de
Apple. (Team ID, Key ID y la clave `.p8` son para revocar tokens al borrar la
cuenta, tarea T4, y todavía no se usan.)

## Contrato

`POST /api/auth/apple/token` (requiere `x-api-key`, sin sesión previa):

```json
{
  "identityToken": "<JWT de Apple>",
  "nonce": "<nonce CRUDO>",
  "nombre": "Ana Pérez"
}
```

- `identityToken` y `nonce` son obligatorios. `nombre` solo llega en la
  **primera** autorización (Apple no lo incluye en el token); la app lo manda
  entonces y lo omite (o `null`) después.
- 200 → `{ token, userId, expiresAt }` para usar como `Authorization: Bearer`.
  Sin cookie. El body es idéntico para login y alta.
- 401 → mismo body que `/api/auth/login` para **cualquier** causa (body inválido,
  token inválido/expirado, `aud` o nonce incorrectos, email ausente, etc.). La
  causa solo aparece en el log del servidor (`motivo`).
- 404 → feature apagada. 429 → límite por IP (30 intentos / 15 min, presupuesto
  propio; solo un login de usuario existente lo libera, un alta no).

## Qué verifica el servidor

Firma RS256 contra `https://appleid.apple.com/auth/keys` (clave elegida por `kid`,
fetch con timeout de 5 s y caché de `jose`), `iss = https://appleid.apple.com`,
`aud = APPLE_BUNDLE_ID`, `exp`, y el nonce.

**Nonce.** La app genera un nonce aleatorio, le pasa a Apple su **SHA-256 en
hex** (`ASAuthorizationAppleIDRequest.nonce`) y envía al servidor el nonce
**crudo**. Apple copia el valor recibido al claim `nonce` del token; el servidor
hashea el crudo y lo compara en tiempo constante. Solo se acepta la forma
hasheada, y un token sin claim `nonce` falla.

## Identidad y cuentas

- La identidad es el `sub` del token (`User.appleSub`), nunca el email.
- Primera vez con un `sub` desconocido:
  - Con email real verificado de una cuenta existente → se enlaza el `sub` a esa
    cuenta, salvo que ya tenga **otro** `appleSub` (guarda anti-takeover).
  - Con email relay (`@privaterelay.appleid.com` / `is_private_email`) → nunca se
    enlaza por email; se crea una cuenta nueva (nombre por defecto `Usuario` si
    la app no manda `nombre`).
  - Sin coincidencia → se crea la cuenta (email cifrado, ADR-013; catálogo
    copiado en la misma transacción, ADR-036).
- **La app debe pedir el scope `email`** en la primera autorización. Una cuenta
  nueva sin email falla cerrada (401, log `email-ausente`); un usuario ya
  registrado no lo necesita en los logins siguientes.

## Pasos de activación

1. **Apple Developer.** Registrar el App ID con la capability _Sign in with
   Apple_ habilitada. Anotar el Bundle ID (p. ej. `cl.mirach.app`). Hace falta
   una cuenta del Apple Developer Program.
2. **Migración (manual, después del deploy).** Render no corre migraciones. Tras
   desplegar el commit con esta feature, aplicar contra la base de producción
   `20261004000000_add_apple_sub` (`prisma migrate deploy`), que agrega
   `User.appleSub` (nullable, única). Es aditiva, pero el cliente de Prisma
   desplegado ya conoce la columna: aplicarla **enseguida** del deploy, porque
   hasta entonces cualquier consulta que lea o devuelva la fila completa de
   `User` (p. ej. el alta de una cuenta) puede fallar.
3. **Render.** Cargar `APPLE_BUNDLE_ID=<bundle ID>` en el servicio `mirach-api`
   (declarada `sync: false`) y reiniciar. El boot falla con un mensaje claro si
   el valor no parece un bundle ID.
4. **Verificar.**
   ```bash
   curl -s -H "x-api-key: $API_KEY" https://<api>/api/auth/capabilities
   # esperado: "appleLoginEnabled": true
   curl -s -o /dev/null -w '%{http_code}\n' -X POST -H "x-api-key: $API_KEY" \
     -H 'content-type: application/json' -d '{}' https://<api>/api/auth/apple/token
   # esperado: 401 (nunca 404 con la feature activa)
   ```
5. **Prueba real en dispositivo.** Un iPhone físico con la app: primera
   autorización (con `email`) crea la cuenta; cerrar sesión y volver a entrar
   resuelve por `sub`. Repetir con "Ocultar mi correo".

## Kill switch

Quitar `APPLE_BUNDLE_ID` en Render y reiniciar: el endpoint vuelve a 404 y la
capability a `false`. Las cuentas y sesiones existentes no se tocan.
