# Especificación: consentimientos versionados

## Propósito

Define el registro de consentimientos (issue #112, AUTH-03, PRI-02, PRI-06, ADR-004 §8, ADR-006 §4): qué aceptó cada persona, en qué versión y cuándo. Es base de licitud para la Ley 21.719 (ADR-009 §9).

La exigencia está detrás de `CONSENTS_REQUIRED`, apagada por defecto. Las apps instaladas todavía no muestran esas pantallas (#134): exigirlo antes dejaría a nadie registrarse ni importar. Se enciende cuando esa versión sea la mínima (`APP_MIN_VERSION_*`). El registro funciona siempre, con la variable encendida o apagada.

## Requisitos

### Requisito: CON-01 — Un consentimiento vigente por tipo

Los tipos son `terminos`, `privacidad` y `cartolas`. Cada usuario MUST tener a lo más un registro vigente (`revocadoEn` nulo) por tipo, y los revocados MUST conservarse como historial hasta borrar la cuenta. La versión MUST tener de 1 a 32 letras, dígitos, puntos, guiones o guiones bajos.

#### Escenario: aceptar la versión vigente no cambia nada

- DADO un consentimiento vigente de `cartolas` en la versión `1`
- CUANDO la persona acepta `cartolas` en la versión `1`
- ENTONCES sigue habiendo un registro, con su fecha original

#### Escenario: aceptar otra versión conserva el historial

- DADO un consentimiento vigente de `cartolas` en la versión `1`
- CUANDO la persona acepta `cartolas` en la versión `2`
- ENTONCES el registro de la versión `1` queda revocado y el de la versión `2` queda vigente

### Requisito: CON-02 — Términos en el alta

`POST /api/auth/apple/token` y `POST /api/auth/google/token` MUST aceptar `versionTerminos` y `versionPrivacidad` opcionales y guardarlas en la misma transacción que crea la cuenta. Un usuario existente MUST NOT necesitarlas.

#### Escenario: con la exigencia encendida, un alta sin versiones no crea la cuenta

- DADO `CONSENTS_REQUIRED=true` y una identidad sin cuenta
- CUANDO la app envía el token sin versiones
- ENTONCES la respuesta es el 401 genérico y no se crea la cuenta

#### Escenario: con la exigencia apagada, un alta sin versiones crea la cuenta sin registros

- DADO `CONSENTS_REQUIRED=false` y una identidad sin cuenta
- CUANDO la app envía el token sin versiones
- ENTONCES se crea la cuenta y no tiene consentimientos

#### Escenario: una versión incompleta o malformada no crea la cuenta

- DADO una identidad sin cuenta
- CUANDO la app envía solo `versionTerminos`, o una versión con formato inválido
- ENTONCES la respuesta es el 401 genérico y no se crea la cuenta, con la exigencia encendida o apagada

#### Escenario: un usuario existente no necesita versiones

- DADO `CONSENTS_REQUIRED=true` y una identidad con cuenta
- CUANDO la app envía el token sin versiones
- ENTONCES la respuesta es 200

### Requisito: CON-03 — Endpoints de consentimiento

`GET /api/consentimientos`, `POST /api/consentimientos` y `DELETE /api/consentimientos/{tipo}` MUST exigir sesión y MUST operar solo sobre el usuario de la sesión.

#### Escenario: un usuario no accede a los consentimientos de otro

- DADO un consentimiento vigente de Marcela
- CUANDO otro usuario lista o revoca sus consentimientos
- ENTONCES no ve el de Marcela y el de Marcela sigue vigente

#### Escenario: revocar sin nada vigente

- DADO un usuario sin consentimiento vigente de `cartolas`
- CUANDO pide `DELETE /api/consentimientos/cartolas`
- ENTONCES la respuesta es 204

### Requisito: CON-04 — No se importa sin consentimiento

Con `CONSENTS_REQUIRED=true`, `POST /api/ingestas`, `POST /api/ingestas/preview` y `POST /api/ingestas/commit` MUST responder `409 CONSENTIMIENTO_CARTOLAS_REQUERIDO` sin consentimiento vigente de `cartolas`, antes de leer el archivo.

#### Escenario: no se importa sin consentimiento

- DADO que Marcela no aceptó el procesamiento de cartolas
- CUANDO sube una cartola
- ENTONCES recibe 409 CONSENTIMIENTO_CARTOLAS_REQUERIDO y no se lee el archivo

#### Escenario: revocar bloquea las importaciones nuevas

- DADO que Marcela aceptó y luego revocó el consentimiento de `cartolas`
- CUANDO sube una cartola
- ENTONCES recibe 409 CONSENTIMIENTO_CARTOLAS_REQUERIDO

### Requisito: CON-05 — Los consentimientos se borran con la cuenta

Eliminar la cuenta MUST borrar sus consentimientos en la misma transacción, y MUST NOT tocar los de otro usuario.
