---
tipo: adr
proyecto: Mirach
estado: Aceptado
fecha: 2026-10-24
requisitos: [RNF-SEC-001, RNF-SEC-002, RNF-SEC-003, RNF-SEC-004, RNF-PRV-001, RNF-PRV-002, RNF-PRV-003, RNF-PRV-004, RNF-PRV-005, IMP-11, IMP-23, PRI-02, PRI-04, AUTH-05]
---

# ADR-009 — Seguridad by design y by default

## Estado

Aceptado (2026-10-25); propuesto el 2026-10-24. Cifrado, aislamiento, validación, redacción de logs y controles del
pipeline están construidos (**vigente**). La verificación de la Data API de Supabase, los
límites de lectura de PDF, el versionado de llaves y el plan de cumplimiento de la Ley
21.719 son **nuevos**.

## Contexto

- Mirach guarda movimientos bancarios de personas: montos, glosas con nombres de comercios
  y personas, número de cuenta y email. Una filtración dañaría a los usuarios y destruiría
  la propuesta de valor, que se apoya en la privacidad (RNF-PRV-003).
- La entrada principal son archivos que sube el usuario (Excel y PDF): la superficie de
  ataque más expuesta (RNF-SEC-001).
- La Ley 21.719 rige desde el 1 de diciembre de 2026 (con un proyecto en el Senado para
  postergarla).
- Un solo desarrollador opera el sistema: los controles tienen que ser automáticos y los
  valores por defecto tienen que ser seguros sin que nadie los recuerde.

## Decisión

### 1. Modelo de amenazas (STRIDE resumido)

| Amenaza | Ejemplo en Mirach | Control principal |
|---------|-------------------|-------------------|
| Suplantación | Usar un ID token robado o de otra app | Verificación de firma, `aud`, `iss`, `exp` y nonce (ADR-006) |
| Manipulación | Archivo malicioso que explota el lector | Validación de tipo, tamaño y estructura; lectores sin ejecución de código (sección 3) |
| Repudio | Negar que se aceptó el tratamiento de datos | Consentimiento guardado con versión y fecha (ADR-004) |
| Divulgación | Un usuario lee movimientos de otro (BOLA/IDOR); volcado de la base | `userId` en cada consulta; cifrado por columna con llave fuera de la base |
| Denegación de servicio | Subir PDFs enormes o en ráfaga | Límites de tamaño, páginas, tiempo y tasa por usuario |
| Elevación de privilegios | Saltarse los límites del plan desde la app | Derechos verificados en el servidor (ADR-006) |

### 2. Minimización de datos (by design)

- No se piden claves bancarias ni acceso al correo; no hay conexión con bancos
  (RNF-PRV-001, RNF-PRV-002).
- El archivo de la cartola se procesa en memoria y nunca se escribe en disco ni en la base
  (RNF-PRV-005 por construcción).
- La contraseña de un PDF protegido se usa solo para abrir ese archivo, no se guarda ni se
  registra (IMP-11).
- No se guarda nombre ni RUT del titular que trae la cartola.
- No se usan modelos de IA sobre los movimientos; si eso cambia, se reescribe primero la
  promesa de privacidad.

### 3. Entrada de archivos (RNF-SEC-001, IMP-23)

| Control | Estado |
|---------|--------|
| El servidor decide extensión, tipo real (firma de bytes), tamaño y estructura; el filtro de la app es solo ayuda | Vigente |
| Límite de 10 MB por archivo, con `multer` en memoria | Vigente |
| Solo `.xlsx` con ExcelJS, que no ejecuta macros; `.xls` rechazado | Vigente |
| `pdfjs-dist` sin ejecución de scripts del documento | Vigente |
| Límite de páginas por PDF y tiempo máximo de lectura | **Nuevo** |
| Límite de 20 vistas previas por usuario por hora | **Nuevo** |
| Rechazo controlado de todo archivo inválido, sin excepciones sin manejar | Vigente |

### 4. Cifrado

- **En tránsito:** HTTPS en todo (TLS gestionado por Render y Vercel). Las apps no permiten
  HTTP en claro (ATS en iOS, `cleartextTrafficPermitted=false` en Android).
- **En reposo:** cifrado de disco de Supabase para toda la base.
- **Por columna:** AES-256-GCM con IV aleatorio en `descripcion`, `numeroCuenta`, `email`
  y `appleRefreshToken`, implementado como servicio de infraestructura (`CryptoService`).
  El email se busca por un índice ciego HMAC-SHA256 con una llave derivada.
- **Llaves:** `ENCRYPTION_KEY` vive solo en el panel de Render y en un respaldo fuera de
  línea; nunca en el repo ni en la base.
- **Rotación (nuevo):** cada valor cifrado lleva un prefijo con la versión de la llave
  (`v1:`). Para rotar se agrega la llave nueva, el API descifra con la versión indicada y
  cifra con la nueva, y un script recifra lo existente en lotes.

### 5. Aislamiento entre usuarios (RNF-SEC-002)

Cada repositorio filtra por el `userId` de la sesión en la consulta. Cada endpoint con datos
de usuario tiene un test de integración que intenta leer o modificar recursos de otro
usuario y espera `404`. El DAST no cubre este riesgo; las pruebas sí.

### 6. Base de datos expuesta solo al API (nuevo)

Supabase publica por defecto una Data API (PostgREST) sobre el esquema `public`. Mirach no
la usa. Se desactiva en el proyecto, o, si no se puede, se habilita Row Level Security sin
políticas en todas las tablas para que esa vía no devuelva nada. Se verifica con los
avisos de seguridad de Supabase después de cada migración. Pendiente: el proyecto `mirach`
estaba pausado el 2026-10-24 y no se pudo revisar.

### 7. Valores por defecto seguros (by default)

| Aspecto | Valor por defecto |
|---------|-------------------|
| Configuración | Validada con Zod al arrancar; sin una variable obligatoria el API no arranca |
| Funciones opcionales | Un login o flujo sin sus variables responde `404`; `/auth/capabilities` informa qué está encendido |
| CORS | Lista de orígenes vacía; las piezas web del API están apagadas |
| Pruebas destructivas | Prohibidas contra URLs de producción (`db-safety`) y `ALLOW_DESTRUCTIVE_DB` prohibido en producción |
| Usuario nuevo | Plan gratis; sin consentimiento de cartolas no puede importar (PRI-02) |
| Errores | Mensaje genérico al cliente; el detalle queda en los logs sin datos personales |
| Logs | Redacción obligatoria de montos, glosas, email, tokens, cookies y `x-api-key` (RNF-SEC-004) |
| Errores y crashes | `sendDefaultPii=false`, limpieza en `beforeSend`, sin grabación de sesión (ADR-011) |
| Encabezados | `x-powered-by` desactivado; **nuevo:** `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store` en respuestas con datos |
| Apps | Solo la `x-api-key` va en el binario; la sesión en Keychain o Keystore; sin logs de datos en builds de release; datos excluidos del respaldo en la nube del sistema |

### 8. Cadena de suministro

- `.npmrc`: `minimum-release-age` de 7 días, `audit-level=high`,
  `block-exotic-subdeps=true`; scripts de instalación solo para paquetes permitidos.
- Dependabot semanal; acciones de GitHub fijadas por SHA.
- En CI: `pnpm audit`, gitleaks, Semgrep, Schemathesis y ZAP, todos bloqueantes (ADR-008).

### 9. Ley 21.719 (nuevo, requiere revisión legal)

| Obligación | Cómo se cumple |
|------------|----------------|
| Base de licitud | Consentimiento específico, con versión y fecha, para términos, privacidad y procesamiento de cartolas (AUTH-03, PRI-02) |
| Revocar el consentimiento | Bloquea nuevas importaciones (PRI-06) |
| Acceso y portabilidad | Exportar movimientos en CSV o Excel en todos los planes (PRI-04) |
| Supresión | Borrar la cuenta desde la app (AUTH-05) y desde la web (LAN-07); los respaldos rotan en 7 días con plan Pro |
| Transferencia internacional | Datos en EE. UU. (Render, Supabase, Sentry, RevenueCat): declararlo y respaldarlo con los acuerdos de tratamiento de datos de cada proveedor |
| Seguridad | Este ADR |
| Brechas | Procedimiento de la sección 10 y notificación según los plazos de la ley |

### 10. Respuesta a incidentes

| Incidente | Acción inmediata |
|-----------|------------------|
| Fuga de `x-api-key` | Rotarla y publicar versiones nuevas de las apps; mientras tanto la autorización sigue siendo la sesión |
| Sospecha de sesiones robadas | Borrar las sesiones afectadas (o todas) |
| Fuga de `ENCRYPTION_KEY` | Rotación de la sección 4 |
| Fuga de credenciales de la base | Rotar la contraseña en Supabase y actualizar Render |
| Vulnerabilidad crítica en una dependencia | Parche con excepción explícita a `minimum-release-age` |

### 11. Verificación

- Revisión por PR con una lista fija: inyección, secretos, validación de entrada,
  aislamiento por usuario, datos en logs.
- Antes del lanzamiento: revisión contra OWASP ASVS nivel 1 (API) y OWASP MASVS L1 (apps).

## Alternativas consideradas

| Alternativa | Por qué no |
|-------------|------------|
| Solo cifrado de disco | Un volcado o una credencial filtrada expondría glosas y emails en claro. |
| Cifrar también montos y fechas | Impide sumar y agrupar en SQL; obligaría a calcular el 50/30/20 en memoria. |
| Certificate pinning en las apps | Una rotación de certificado del proveedor dejaría las apps sin conexión hasta publicar otra versión. |
| Conexión directa a los bancos | Contradice RNF-PRV-001 y RNF-PRV-002, y es el diferenciador de privacidad. |

## Consecuencias

- La privacidad que promete la landing es verificable en el código y en las pruebas.
- Las glosas cifradas no se buscan con SQL (ADR-004).
- Rotar `x-api-key` exige publicar las apps; rotar `ENCRYPTION_KEY` exige el script de
  recifrado.

## Referencias

- ADR-004, ADR-006, ADR-008, ADR-011
- Ley 21.719 sobre protección de datos personales
- OWASP ASVS, OWASP MASVS, OWASP API Security Top 10
- Serie anterior: ADR-013, ADR-021, ADR-047
