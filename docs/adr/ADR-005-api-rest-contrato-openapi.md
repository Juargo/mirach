---
tipo: adr
proyecto: Mirach
estado: Propuesto
fecha: 2026-10-24
requisitos: [RNF-EXA-002, RNF-PER-001, IMP-01, IMP-06, IMP-10, IMP-23, PER-03, PER-08, PLA-08, PRI-04, AUTH-06]
---

# ADR-005 — API REST con contrato OpenAPI, reutilizando el API de MoneyDiary

## Estado

Propuesto (2026-10-24). El API heredado de MoneyDiary vive en `apps/api` y está desplegado
(**vigente**). La política de compatibilidad, la configuración remota y la lista de cambios
para la v1 son **nuevas**.

## Contexto

- MoneyDiary dejó un API Express + TypeScript con la ingesta de los cuatro bancos (Excel y
  PDF, incluido el PDF con contraseña), el catálogo de clasificación por usuario, el
  resumen 50/30/20, el semáforo, los movimientos manuales y el login nativo con Apple y
  Google. La decisión de producto es reutilizarlo y modificarlo, no reescribirlo.
- Los clientes son dos apps nativas generadas desde el contrato. Una versión instalada de
  la app puede seguir en uso meses después de publicar una nueva.
- No hay datos que cambien en el servidor sin una acción del usuario: el usuario sube una
  cartola, edita una categoría o consulta su mes.

## Decisión

### 1. Estilo: REST sobre HTTPS con JSON (vigente)

- Recursos en español bajo `/api` (`/api/resumen`, `/api/ingestas`, `/api/categorias`,
  `/api/movimientos`, `/api/cuenta`).
- Verbos HTTP con su semántica: `GET` sin efectos, `POST` crea, `PATCH` modifica parcial,
  `DELETE` borra.
- Subida de cartolas con `multipart/form-data`, límite de 10 MB, archivo en memoria.
- La ingesta es de dos pasos: `POST /api/ingestas/preview` (lee y muestra, no guarda) y
  `POST /api/ingestas/commit` (guarda lo revisado). El endpoint de un solo paso
  `POST /api/ingestas` está deprecado y se elimina antes del lanzamiento.

### 2. Contrato OpenAPI como artefacto versionado (vigente)

- Los esquemas de petición y respuesta se escriben en Zod y `zod-openapi` emite
  `apps/api/openapi.json` (OpenAPI **3.0.3**, porque el generador de Swift no soporta las
  propiedades anulables de 3.1).
- El contrato se commitea. `pnpm api openapi:check` falla en CI si quedó desactualizado.
- Los clientes Swift (`swift-openapi-generator`) y Kotlin se generan desde el contrato y se
  commitean; el CI falla si un cliente no corresponde al contrato actual.
- El contrato es la frontera: ningún cliente importa código del dominio del API.

### 3. Sin WebSocket ni SSE (nuevo)

Nada en la v1 necesita que el servidor empuje datos: todos los cambios nacen de una acción
del usuario, que ya recibe la respuesta. Para el único caso potencialmente lento (cartola
grande, IMP-10):

- Hoy la vista previa responde de forma síncrona.
- Si pasa a cola (gatillo de ADR-003), la respuesta será `202 Accepted` con el id del
  trabajo y la app consultará `GET /api/ingestas/{id}` con espera creciente.
- Las notificaciones push quedan fuera de la v1.

### 4. Compatibilidad con versiones instaladas (nuevo)

1. Dentro de `/api` solo se hacen **cambios aditivos**: campos nuevos opcionales en
   respuestas, parámetros nuevos opcionales, endpoints nuevos.
2. Nunca se renombra, se elimina ni se cambia el tipo de un campo o endpoint que una versión
   publicada usa. Si hace falta, se crea uno nuevo y el viejo se retira cuando la versión
   mínima soportada ya no lo usa.
3. Un cambio incompatible inevitable va a `/api/v2` para ese recurso.
4. Las apps envían `X-App-Version` y `X-App-Platform` en cada petición.
5. `GET /api/config` (público, solo con `x-api-key`) devuelve la versión mínima soportada
   por plataforma, los límites del plan gratis y flags. Si la versión instalada es menor,
   la app pide actualizar. Sirve también para PLA-08 (límites configurables sin publicar).
6. En CI, `oasdiff` compara el contrato del PR con el de `main` y falla ante un cambio
   incompatible no marcado (ADR-008).

### 5. Errores (ajuste)

- Hoy las respuestas de error llevan `{ "message": "..." }`. Se agrega un `codigo` estable
  legible por máquina (`BANCO_NO_RECONOCIDO`, `PDF_CON_CONTRASENA`, `PDF_ESCANEADO`,
  `CARTOLA_TARJETA_NO_SOPORTADA`, `LIMITE_BANCOS_PLAN`), documentado en el contrato. La app
  traduce el código a un mensaje simple (IMP-06) sin depender del texto.
- Validación en el borde con Zod: `400` con todos los problemas en una pasada (IMP-15).
- Recursos de otro usuario responden `404`, no `403` (ADR-006).
- Pendientes heredados: JSON mal formado responde `500` en vez de `400`, y las rutas de
  token nativo responden `401` ante una caída de infraestructura en vez de `5xx`.

### 6. Idempotencia

- Confirmar una ingesta es idempotente por la clave de duplicado: repetir el commit no
  duplica movimientos.
- `POST /api/movimientos` (movimiento manual) acepta `Idempotency-Key`: un doble toque con
  red lenta no crea dos movimientos.
- Los webhooks de suscripción se procesan una vez por id de evento (ADR-012).

### 7. Cambios al API para la v1

Brechas encontradas al contrastar las rutas y el esquema actuales con los requisitos v1.
Cada una se especifica e implementa por separado.

| Cambio | Endpoint propuesto | Requisitos |
|--------|--------------------|------------|
| Perfil de porcentajes (predefinidos y personalizado) | `GET/PUT /api/perfil/presupuesto` | PER-03 a PER-06 |
| Día de corte del mes financiero e ingreso declarado | En el mismo recurso; `/resumen` y `/movimientos` reciben el período | PER-02, PER-08 |
| Metas del resumen calculadas desde el perfil, no fijas | `GET /api/resumen` | VIS-01, PER-06 |
| Consentimientos con versión | `GET/POST /api/consentimientos`, `DELETE` para revocar | AUTH-03, PRI-02, PRI-06 |
| Exigir consentimiento antes de importar | `POST /api/ingestas/preview` responde `409` sin él | PRI-02 |
| Exportar mis datos | `GET /api/exportacion?formato=csv` | PRI-04 |
| Plan y derechos | `GET /api/plan`; webhook `POST /api/webhooks/revenuecat` | PLA, ADR-012 |
| Límite de bancos del plan gratis | Validación en preview y commit | IMP-24 |
| Configuración remota y versión mínima | `GET /api/config` | PLA-08 |
| Rechazar estados de cuenta de tarjeta | Detección en la ingesta | IMP-02 |
| Transferencias propias, sobregiros y devoluciones | Reglas de clasificación | CLA-04, reglas 4, 5 y 15 |
| Cerrar sesión en todos los dispositivos | `DELETE /api/sesiones` | AUTH-06 |
| Sesión renovable | Ver ADR-006 | AUTH-04 |
| Eventos de producto desde las apps | `POST /api/eventos` | ADR-011 |
| "Deseos" pasa a llamarse "Gustos" | Solo textos y tokens; el id del bloque no cambia | Requisitos v1 |
| Eliminar el endpoint de ingesta de un paso | `POST /api/ingestas` | — |

Las piezas web del API (sesión por cookie, CORS, OAuth web de Google) siguen dormidas y
apagadas en producción.

## Alternativas consideradas

| Alternativa | Por qué no |
|-------------|------------|
| GraphQL | Dos clientes con pantallas conocidas; REST con un contrato generado cubre la necesidad. GraphQL suma caché, autorización por campo y generación de clientes más complejas. |
| gRPC | Mal soporte en el ecosistema de apps sin capa extra, y no hay necesidad de streaming ni de rendimiento extremo. |
| WebSocket o SSE | No hay eventos del servidor que empujar en la v1. |
| Reescribir el API | Perdería la ingesta probada de cuatro bancos, el cifrado y el aislamiento ya verificados. |
| Contrato escrito a mano (diseño primero en YAML) | Dos fuentes de verdad que se desalinean; generarlo desde Zod mantiene una sola, que además valida en tiempo de ejecución. |

## Consecuencias

- Un cambio del contrato obliga a regenerar ambos clientes en el mismo PR.
- La política aditiva acumula campos y endpoints viejos hasta subir la versión mínima; es
  el precio de no romper apps instaladas.
- `GET /api/config` permite cerrar versiones inseguras sin esperar a que el usuario
  actualice por su cuenta.

## Referencias

- ADR-001 Estilo de arquitectura
- ADR-006 Autenticación y autorización
- ADR-012 Suscripciones
- `apps/api/openapi.json`, `apps/api/src/infrastructure/http-express/`
- Serie anterior: ADR-011, ADR-026, ADR-028, ADR-038, ADR-044, ADR-050
