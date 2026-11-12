---
tipo: adr
proyecto: Mirach
estado: Aceptado
fecha: 2026-11-12
requisitos: [AUTH-01, AUTH-02, AUTH-03, AUTH-07, PUB-05]
---

# ADR-013 — Cuenta anónima y vinculación posterior

## Estado

Aceptado (2026-11-12). Decisión del product owner tras el rechazo de App Review del
2026-11-11. Ajusta ADR-006 en tres puntos: el alta (ya no exige Apple o Google), la
duración de la sesión de una cuenta anónima y la vinculación de una identidad a una cuenta
existente. La primera entrega cubre el API y iOS; Android y la fusión de cuentas quedan
para después.

## Contexto

- App Review rechazó la versión 0.1.0 (9) por la guía 5.1.1(v): la app exigía registrarse
  antes de usar funciones que, para Apple, no dependen de una cuenta (importar y registrar
  movimientos).
- La app no puede funcionar solo en el dispositivo: la lectura de cartolas, la
  clasificación y el 50/30/20 viven en el API (ADR-001). El servidor necesita un `userId`
  al cual asociar los datos.
- En `User`, `email`, `appleSub`, `googleSub` y `passwordHash` ya son opcionales, y todo el
  aislamiento se hace por `userId` (ADR-006).
- La sesión dura hoy 7 días fijos. Una persona sin Apple ni Google no puede volver a
  iniciar sesión: si su sesión vence, pierde el acceso a sus datos.
- La `x-api-key` es pública (ADR-006): no sirve para limitar el uso por dispositivo.
- El cliente iOS generado rechaza campos desconocidos (#238), así que las respuestas
  existentes no pueden ganar campos sin coordinar versiones.

## Decisión

1. **Alta anónima.** `POST /api/auth/anonimo` crea un usuario sin `appleSub`, `googleSub`,
   email ni contraseña, con el catálogo copiado de la plantilla y la aceptación de
   términos en la misma transacción (igual que el alta con Apple o Google, incluida la
   regla `CONSENTS_REQUIRED`). Responde `{ token, userId, expiresAt }`. La app la llama
   cuando la persona acepta los términos y elige continuar sin cuenta.
2. **Anónimo es un estado derivado.** Una cuenta es anónima cuando no tiene `appleSub`,
   `googleSub` ni `passwordHash`. No hay columna nueva ni migración.
3. **Sesión de una cuenta anónima.** Dura 365 días y cada uso la extiende, como máximo una
   vez al día. Las cuentas con Apple, Google o contraseña conservan su duración actual. Al
   vincular, la sesión anónima se revoca y se emite una sesión ordinaria.
4. **Vinculación.** `POST /api/cuenta/vincular/apple` y `POST /api/cuenta/vincular/google`,
   con sesión, reciben el mismo token nativo que las rutas de inicio de sesión:
   - Si la identidad es nueva, la cuenta anónima recibe el `sub` y, si el token trae un
     email verificado, el email. No se mueve ningún dato.
   - Si la identidad ya tiene cuenta (por `sub`, o por email verificado que no sea un relay
     privado de Apple, la misma regla del inicio de sesión), responde `409
     CUENTA_YA_EXISTE` y no escribe nada. La app ofrece entrar a esa cuenta y guarda la
     sesión anónima aparte para que la fusión posterior pueda recuperar sus datos.
   - Si quien llama no es una cuenta anónima, responde `409 CUENTA_NO_ANONIMA`.
5. **Fusión de cuentas: segunda entrega.** Unir los datos de una cuenta anónima con una
   cuenta existente exige reapuntar categorías y patrones (unicidad `(userId, bucketId,
   nombre)`, ADR-004), unir cuentas bancarias repetidas y detectar movimientos duplicados
   con la descripción cifrada (ADR-009). Se decide y se construye aparte.
6. **Límites de tasa.** El alta anónima admite 10 por IP por hora y un alta exitosa nunca
   restablece el contador. Las rutas de vinculación usan un presupuesto por IP como las
   rutas de token. Un límite por dispositivo requeriría App Attest (iOS) y Play Integrity
   (Android); queda como mejora posterior.
7. **Respuestas existentes sin cambios de forma.** `GET /api/auth/me` responde `200` para
   una cuenta anónima con `email` vacío. La app sabe que la cuenta es anónima porque ella
   misma la creó, y lo guarda junto a la sesión.
8. **Retención.** Una cuenta anónima sin uso durante 12 meses queda inaccesible (su sesión
   vence) y se purga. El proceso de purga se construye antes de que la primera cuenta
   anónima cumpla ese plazo.
9. **Avisos en la app.** Antes de crear la cuenta anónima y junto a la opción de vincular,
   la app avisa que sin vincular la cuenta los datos se pierden al borrar la app o cambiar
   de teléfono. Para una cuenta anónima la app no ofrece "Cerrar sesión", porque cerrarla
   equivale a perder los datos; "Eliminar cuenta" se mantiene.

## Alternativas consideradas

| Alternativa | Por qué no |
|-------------|------------|
| Responder a Apple que la app depende de una cuenta | No cuesta código, pero la revisión ya clasificó el registro de movimientos como función sin cuenta. |
| Modo solo local, sin servidor | La lectura de cartolas y los cálculos viven en el API (ADR-001); habría que duplicarlos en cada app. |
| Columna `anonimo` en `User` | Duplica un estado que ya se deriva de las credenciales y exige una migración. |
| Agregar `anonimo` a `GET /api/auth/me` | El cliente iOS publicado rechaza campos nuevos (#238). |
| Sesión anónima sin vencimiento | Deja tokens válidos para siempre y cuentas que nunca se pueden purgar. |
| Fusionar en la primera entrega | Es la parte más riesgosa (mueve datos entre dos `userId`) y Apple no la exige. |

## Consecuencias

- La sesión de una cuenta anónima agrega, como máximo, una escritura diaria por usuario
  activo.
- Un token anónimo robado da acceso durante más tiempo que uno ordinario. El token sigue
  en el Keychain, accesible solo en ese dispositivo.
- Quedarán cuentas anónimas abandonadas con cartolas cifradas hasta que la purga las
  elimine; la política de privacidad debe mencionar el plazo.
- Android sigue exigiendo inicio de sesión hasta que adopte el mismo flujo.
- Mientras no exista la fusión, quien vincula a una identidad que ya tiene cuenta debe
  elegir entre seguir anónimo o entrar a la cuenta existente sin los datos del dispositivo.

## Referencias

- ADR-001 Estilo de arquitectura
- ADR-004 Persistencia
- ADR-005 Contrato OpenAPI
- ADR-006 Autenticación y autorización
- ADR-009 Seguridad
- App Store Review Guidelines 5.1.1(v)
- Issue #238
