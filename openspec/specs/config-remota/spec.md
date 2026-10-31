# Especificación: configuración remota de las apps

## Propósito

Define `GET /api/config` (ADR-005 §4.5, issue #116): una app instalada no se actualiza a voluntad, así que el API le informa la versión mínima soportada por plataforma, los límites del plan gratis y los flags, y le dice si debe pedir al usuario que actualice. Los valores viven en la configuración del API y cambian sin publicar una versión nueva (PLA-08).

## Requisitos

### Requisito: CFG-01 — Endpoint público con api-key

`GET /api/config` MUST exigir `x-api-key` y MUST NOT exigir sesión.

#### Escenario: sin api-key se rechaza

- DADO el API desplegado
- CUANDO una app pide `GET /api/config` sin `x-api-key`
- ENTONCES la respuesta es 401

#### Escenario: con api-key y sin sesión responde

- DADO el API desplegado
- CUANDO una app pide `GET /api/config` con `x-api-key` válida y sin sesión
- ENTONCES la respuesta es 200 con `versionMinima` (`ios`, `android`), `planGratis` (`bancosMaximos`, `soloMesActual`), `flags` y `actualizacionRequerida`

### Requisito: CFG-02 — El API decide si la app debe actualizarse

El API MUST calcular `actualizacionRequerida` desde `X-App-Platform` (`ios` | `android`, sin distinguir mayúsculas) y `X-App-Version` (`MAJOR.MINOR.PATCH`, comparada numéricamente). MUST ser `true` cuando la instalada es menor que la mínima de su plataforma, `false` cuando es igual o mayor, y `null` cuando falta alguna cabecera o es inválida. Una cabecera inválida MUST NOT producir un error.

#### Escenario: con una versión mínima mayor a la instalada, la app puede mostrar «Actualiza la app»

- DADO que la versión mínima de iOS es `1.10.0`
- CUANDO una app iOS con versión `1.9.0` pide `GET /api/config`
- ENTONCES `actualizacionRequerida` es `true`

#### Escenario: versión igual a la mínima

- DADO que la versión mínima de iOS es `1.10.0`
- CUANDO una app iOS con versión `1.10.0` pide `GET /api/config`
- ENTONCES `actualizacionRequerida` es `false`

#### Escenario: cabeceras ausentes o inválidas

- CUANDO una app pide `GET /api/config` sin `X-App-Version`, o con `X-App-Platform: web`
- ENTONCES la respuesta es 200 y `actualizacionRequerida` es `null`

### Requisito: CFG-03 — Valores en la configuración del API

Las versiones mínimas, los límites del plan gratis y los flags MUST leerse de variables de entorno (`APP_MIN_VERSION_IOS`, `APP_MIN_VERSION_ANDROID`, `FREE_PLAN_MAX_BANKS`, `FREE_PLAN_CURRENT_MONTH_ONLY`, `APP_FLAGS`). Sin configurar, nadie queda forzado a actualizar (`0.0.0`) y el plan gratis es «mes actual, 2 bancos» (PLA-01). Un valor inválido MUST hacer fallar el arranque.

### Requisito: CFG-04 — Las apps se identifican en cada petición

Las apps iOS y Android MUST enviar `X-App-Version` y `X-App-Platform` en cada petición. El log de cada petición MUST llevar `appVersion` y `appPlatform` solo cuando pasan la validación de CFG-02; el texto crudo de esas cabeceras MUST NOT llegar a los logs (ADR-011).
