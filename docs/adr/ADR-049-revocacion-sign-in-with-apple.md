---
tags:
  - adr
  - fase-diseño
  - auth
  - seguridad
proyecto: Mirach
estado: ✅ Decidido
fecha_creacion: 2026-10-06
fecha_actualizacion: 2026-10-06
---

# ADR-049 — Revocación de tokens de Sign in with Apple

## Estado

✅ **Decidido** (2026-10-06) — plan fase 5, T4. Complementa ADR-047 (autenticación) y se apoya en
ADR-013 (cifrado en reposo). Implementado en la API; falta que la app iOS envíe el
`authorizationCode` y configurar las variables en Render.

## Contexto

La guideline 5.1.1(v) de App Store exige que una app con Sign in with Apple revoque los tokens del
usuario al eliminar su cuenta. Apple solo permite revocar un refresh token, que se obtiene
canjeando el `authorizationCode` de la autorización nativa en `POST https://appleid.apple.com/auth/token`
y se revoca en `POST https://appleid.apple.com/auth/revoke`. El identity token que hoy verifica
`POST /api/auth/apple/token` no sirve para eso. El `authorizationCode` es de un solo uso y vence a
los 5 minutos, así que debe canjearse en el mismo login. Ambas llamadas se autentican con un
`client_secret`: un JWT ES256 firmado con la clave `.p8` de la cuenta Apple Developer.

## Decisión

1. **Refresh token cifrado en `User.appleRefreshToken`** (nullable, columna aditiva). Vive junto a
   `appleSub` porque pertenece a la misma identidad Apple y se destruye con la fila del usuario.
   Se cifra con el `ICryptoService` (AES-GCM, ADR-013); la clave de cifrado está fuera de la BD.
   Cada canje exitoso sobrescribe el valor anterior.
2. **`authorizationCode` opcional y degradación elegante.** `POST /api/auth/apple/token` lo acepta
   como campo opcional (string o null); los builds de la app que no lo envían siguen funcionando.
   Solo se canjea después de verificar el identity token y resolver al usuario. Si el canje falla
   (Apple caído, código vencido o usado, error al guardar) el login tiene éxito igual y se emite un
   `warn` con `userId` y un motivo no secreto; nunca se loguea el code, el refresh token ni el
   secret. Hasta un login posterior con code, ese usuario no tendrá token revocable.
3. **Revocación best-effort antes del borrado.** `AppleRevocadorIdentidadExterna` reemplaza al
   no-op: lee y descifra el token, llama a `/auth/revoke` con `token_type_hint=refresh_token` y un
   timeout de 5 s. Sin token guardado, registra un `info` y sigue. Un fallo registra un `warn`
   atribuible y el borrado continúa. Se revoca **antes** de borrar porque el token vive en la
   fila que el borrado destruye; revocar después no dejaría forma de reintentar si Apple falla. El
   costo aceptado: si el borrado falla tras revocar, el usuario conserva la cuenta con su
   autorización de Apple revocada; al volver a entrar, Apple le pide consentir otra vez y el nuevo
   `authorizationCode` reemplaza el token guardado.
4. **Client secret firmado en infraestructura**, JWT ES256 con `kid` = Key ID y claims `iss` =
   Team ID, `sub` = bundle ID (`app.mirachbudget.ios`), `aud` = `https://appleid.apple.com`, `iat`
   y `exp` a 1 hora (Apple admite hasta 6 meses). Se cachea hasta 5 minutos antes de expirar.
5. **Variables de entorno, todas opcionales:** `APPLE_TEAM_ID`, `APPLE_KEY_ID`,
   `APPLE_PRIVATE_KEY` (contenido PEM de la `.p8`; admite `\n` literales) y la ya existente
   `APPLE_BUNDLE_ID`. Si falta alguna, el canje y la revocación quedan apagados con una línea de
   arranque (`warn` si la configuración está a medias o el PEM es inválido, `info` si no hay
   credenciales) y el login no se ve afectado. La API nunca falla al arrancar por esto.
6. **Orden de despliegue de la migración.** La migración
   `20261006000000_add_apple_refresh_token` es aditiva y se aplica a producción **antes** de
   mergear el cambio (Render no corre `migrate deploy`); el código nuevo escribe la columna.

## Consecuencias

- La revocación solo funciona para usuarios cuya app haya enviado un `authorizationCode`; hasta
  que la app lo envíe, las cuentas Apple existentes no tienen token que revocar.
- Quien tenga acceso a la clave de cifrado y a la BD puede leer los refresh tokens; es el mismo
  modelo de amenaza aceptado en ADR-013.
- Un fallo silencioso de Apple deja la autorización sin revocar; se detecta por los `warn`.

## Alternativas consideradas

- **Revocar después del borrado:** exige leer el token antes y pierde el reintento si Apple falla.
- **Tabla aparte para el token:** más estructura sin beneficio mientras haya un solo proveedor por
  usuario.
- **Hacer obligatorio el `authorizationCode`:** rompería los builds actuales de la app.
- **Secret de 6 meses:** menos firmas, pero un secreto filtrado valdría mucho más tiempo.
