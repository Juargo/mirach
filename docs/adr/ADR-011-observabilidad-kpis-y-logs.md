---
tipo: adr
proyecto: Mirach
estado: Propuesto
fecha: 2026-10-24
requisitos: [RNF-OBS-001, RNF-USA-003, RNF-SEC-004, RNF-PER-001, RNF-PER-002, RNF-FIA-001, PER-01, ADM-01, ADM-03, LAN-03, LAN-04, LAN-08, SOP-03]
---

# ADR-011 — Observabilidad: KPIs, logs, errores y métricas técnicas

## Estado

Propuesto (2026-10-24). Logging estructurado con Pino y redacción está construido
(**vigente**). Decisiones del product owner (2026-10-24): eventos de producto en una
**tabla propia en PostgreSQL**, y errores con una plataforma gratis o freemium con miras a
Sentry, por lo que se usa **Sentry en su plan gratuito** desde el inicio (**nuevo**).

## Contexto

- RNF-OBS-001 pide medir activación, retención a 30 días, conversión a pago y cuánto demora
  el usuario en entender su mes. Son las métricas que validan o descartan el producto.
- La promesa de privacidad limita qué se puede enviar a terceros: nada de montos, glosas ni
  datos personales.
- Hoy los errores solo se ven en los logs de Render.
- Presupuesto: herramientas gratis mientras el producto se valida.

## Decisión

### 1. KPIs de producto

Las metas son hipótesis iniciales; se ajustan con los primeros datos.

| KPI | Definición | Meta inicial |
|-----|------------|--------------|
| Activación | % de cuentas nuevas que confirman su primera cartola dentro de 7 días | ≥ 40 % |
| Tiempo de onboarding (PER-01) | Desde `cuenta_creada` hasta el primer `resumen_visto` con datos | Mediana < 5 min |
| Tiempo hasta entender el mes (RNF-USA-003) | Desde `ingesta_confirmada` hasta `resumen_visto`, más la respuesta a "¿te sirvió?" (SOP-03) | Mediana < 60 s; ≥ 70 % "sí" |
| Retención a 30 días | % de cuentas activas en los días 28 a 35 después de crearse (abren el resumen o suben una cartola) | ≥ 25 % |
| Conversión de prueba a pago | % de pruebas de 30 días que terminan en suscripción | ≥ 5 % |
| Conversión de gratis a Plus | % de cuentas gratis que se suscriben en 90 días | Medir |
| Éxito de ingesta (RNF-FIA-001) | Vistas previas exitosas sobre intentos, por banco y formato | ≥ 95 % por banco |
| Calidad de clasificación | % de movimientos en "Desconocido" después de confirmar | < 20 % |
| Landing (LAN-03, LAN-04) | % de visitas que dejan su correo; % que toca el botón de precio, por precio | ≥ 5 % correo |

### 2. Eventos de producto en tabla propia

- Tabla `EventoProducto`: `nombre` (de una lista cerrada), `userId`, `ocurridoEn`,
  `plataforma`, `versionApp` y `propiedades` (`jsonb`) con valores de listas cerradas: banco,
  formato, plan, resultado, código de error, duración en milisegundos.
- **Prohibido en eventos:** montos, glosas, emails, nombres de categorías escritos por el
  usuario y cualquier texto libre. Un test valida cada evento contra un esquema Zod.
- Eventos del servidor, emitidos por los casos de uso: `cuenta_creada`,
  `consentimiento_aceptado`, `ingesta_preview`, `ingesta_confirmada`, `ingesta_fallida`
  (con banco, formato y código), `perfil_cambiado`, `plan_cambiado`, `cuenta_eliminada`.
- Eventos de las apps, por `POST /api/eventos` en lotes: `resumen_visto`,
  `onboarding_paso`, `guia_banco_abierta`, `respuesta_te_sirvio`.
- Los KPIs se calculan con vistas SQL. Esas vistas son también la base del panel de
  métricas agregadas (ADM-01) y del reporte de errores por banco y formato (ADM-03).
- Retención: 13 meses. Al borrar la cuenta, sus eventos se borran en la misma transacción.
- Sin SDK de analítica de terceros en las apps: no hay identificador publicitario, no se
  necesita el aviso de rastreo de iOS y la declaración de datos de las tiendas queda simple.

### 3. Analítica de la landing

Analítica sin cookies (Vercel Web Analytics mientras la landing esté en Vercel), con eventos
para la lista de espera y el botón de precio de puerta falsa (LAN-08). Los correos de la
lista de espera se guardan con consentimiento.

### 4. Logs

- Pino en JSON estructurado; `pino-http` registra cada petición (vigente).
- Campos estándar: `time`, `level`, `reqId`, `metodo`, `ruta` (la plantilla, por ejemplo
  `/api/ingestas/:id`, no la URL con ids), `status`, `duracionMs`, `userId` (id interno),
  `versionApp`, `plataforma`.
- **Correlación (nuevo):** el API devuelve `X-Request-Id`; la app lo muestra como "código
  de soporte" en las pantallas de error, y soporte lo busca en los logs y en Sentry.
- **Redacción obligatoria (vigente, RNF-SEC-004):** montos, glosas, email, `authorization`,
  `x-api-key`, cookies, contraseñas, ID tokens y parámetros sensibles de la URL. Nunca se
  registra el cuerpo de una subida.
- Niveles: `error` (requiere acción), `warn` (degradado, por ejemplo la revocación de Apple
  falló), `info` (petición y eventos de negocio), `debug` (solo en desarrollo).
- Retención: la de Render en el plan vigente. Si hace falta más historia o búsqueda, se
  agrega un drenaje de logs a un servicio externo con su propia redacción.

### 5. Errores y crashes: Sentry en plan gratuito

- SDK de Sentry en el API (Node), en iOS y en Android, en un solo proyecto de organización.
- Plan gratuito para un desarrollador; se pasa a un plan pago si se agotan las cuotas.
  Las cuotas vigentes se confirman al crear la cuenta.
- Configuración obligatoria: `sendDefaultPii=false`; `beforeSend` y
  `beforeBreadcrumb` aplican la misma redacción que los logs; sin cuerpos de petición; sin
  grabación de sesión; capturas de pantalla desactivadas.
- Cada release se etiqueta con la versión de release-please para ver errores por versión.
- La tasa de sesiones sin crash de Sentry gobierna el avance del lanzamiento escalonado
  (ADR-008).

### 6. Métricas técnicas y objetivos de servicio

| Indicador | Objetivo | Fuente |
|-----------|----------|--------|
| Disponibilidad del API | ≥ 99,5 % mensual (con plan pagado; en el plan gratis, el arranque en frío es riesgo aceptado, ADR-002) | Monitor externo |
| p95 de `GET /api/resumen` en el servidor | < 500 ms (RNF-PER-002 pide < 2 s en la app) | Logs (`duracionMs`) |
| p95 de la vista previa de cartola | < 5 s (RNF-PER-001) | Logs y eventos |
| Tasa de respuestas 5xx | < 1 % | Logs |
| Sesiones sin crash por app | ≥ 99,5 % | Sentry |

### 7. Disponibilidad y alertas

- Monitor externo gratis (por ejemplo UptimeRobot o Better Stack) contra la ruta de salud
  cada 5 minutos, con aviso por correo y push.
- Alertas de Sentry: error nuevo, aumento brusco de errores, regresión en una versión.
- Revisión semanal de una consulta SQL: éxito de ingesta por banco y formato; si un banco
  cae bajo 95 %, se prioriza su lector.

### 8. Auditoría

Los registros de auditoría (consentimientos y accesos de soporte en `AccesoSoporte`) viven
en tablas propias, no en los logs, porque deben durar más y no pueden perderse con la
rotación.

## Alternativas consideradas

| Alternativa | Por qué no |
|-------------|------------|
| PostHog, Mixpanel o Firebase Analytics | Embudos listos, pero suman un tercero con datos de uso, un SDK en cada app y otra línea en la declaración de datos de las tiendas. Con pocos eventos y SQL alcanza. |
| GlitchTip | Compatible con los SDK de Sentry; autoalojarlo agrega operación. Si las cuotas de Sentry no alcanzan, es la salida sin cambiar código. |
| Firebase Crashlytics | Gratis, pero solo cubre las apps y agrega Firebase; el API quedaría aparte. |
| Solo logs de Render | Sin agrupación de errores, sin crashes de las apps, sin alertas. |

## Consecuencias

- Los KPIs se pueden calcular desde el primer usuario sin enviar datos de uso fuera.
- Construir embudos y retención en SQL es trabajo propio; un panel visual queda para
  después.
- Sentry agrega un proveedor en EE. UU. que debe figurar en la política de privacidad.

## Referencias

- ADR-002, ADR-004, ADR-008, ADR-009
- RNF-OBS-001; requisitos ADM, LAN y SOP
- Serie anterior: ADR-019, ADR-033
