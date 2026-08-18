---
tags:
  - adr
  - fase-diseño
  - mobile
  - configuracion
proyecto: MoneyDiary
estado: 🔵 Propuesto
fecha_creacion: 2026-08-17
fecha_actualizacion: 2026-08-17
---

# ADR-038 — Alcance de escritura de la app mobile: perfil propio y catálogo de clasificación

## Estado

🔵 **Propuesto** (2026-08-17, fase de diseño de US-044) — **supersede la regla de alcance de
ADR-026**. Se revisa y se acepta en el PR que implementa la primera slice de US-044 (CQ-1 del
proposal de `us-044-mobile-configuracion`).

> [!info] Relación con ADR-026
> No reemplaza a ADR-026 Ingesta desde mobile: la capacidad de subir cartola, el transporte, el
> selector nativo y sus reglas de seguridad siguen **vigentes tal cual**. Este ADR supersede
> **una sola regla** suya — la regla 4 de su Decisión: *"Escritura acotada a ingesta: editar
> transacciones/categorías (US-013) **no** entra por esta puerta. Si algún día se quiere, es otro
> ADR con su propia justificación."* Este es ese ADR.
>
> Se sigue el mismo patrón con el que ADR-026 enmendó a ADR-010: el ADR viejo **no se edita**
> (convención de `docs/adr/README.md`), la relación se declara acá y el índice anota la regla
> superseded.

---

## Contexto

ADR-010 definió la app mobile alrededor de la **consulta**. ADR-026 abrió una grieta única y
nombrada — subir cartola — y fijó explícitamente que ninguna otra escritura entraba por esa puerta.
Esa frontera se sostuvo durante cuatro sprints y sigue siendo la razón por la que la app mobile es
pequeña y auditable.

Tres cosas cambiaron desde entonces, y las tres son verificables en el repo, no proyecciones:

1. **La app mobile dejó de ser un visor de un solo número.** US-050 shippeó el dashboard 50/30/20
   completo (mes + grilla anual de 12 meses). El teléfono es hoy donde el usuario efectivamente
   *lee* sus finanzas.
2. **El catálogo de clasificación es la palanca que mueve ese dashboard.** Desde ADR-036/ADR-037 el
   catálogo (`Categoria`/`PatronClasificacion`) es **propiedad de cada usuario**, y cambiar el
   bucket de una categoría re-estampa el `bucketId` de sus transacciones en todos los períodos
   (`actualizar-categoria.use-case.ts`, D-07). Es decir: la cosa que decide qué muestra la pantalla
   que el usuario está mirando en el teléfono solo se puede editar en el escritorio.
3. **El backend ya está desplegado y atado a sesión.** `PATCH /api/perfil`,
   `PATCH /api/perfil/password` (US-040) y el CRUD de `/api/categorias` + `/api/patrones`
   (US-038/US-039) están en producción, con aislamiento por `userId` (RNF-SEC-006) y rechazo de
   sesiones demo. Mobile ya sostiene sesión Bearer y ya envía `x-api-key`. **No falta backend, ni
   contrato, ni credencial** — falta superficie de cliente.

El punto de decisión es de **alcance**, otra vez, y hay que resolverlo explícitamente: cada
"excepción" no declarada erosiona la frontera de ADR-010 hasta que deja de existir. La pregunta no
es "¿mobile puede escribir?" sino **"¿cuál es la regla que dice qué puede escribir y qué no?"**.

---

## Decisión

**La app mobile puede escribir aquello que (a) pertenece exclusivamente al usuario autenticado y (b)
determina cómo se leen sus propios datos: su perfil (`nombre`/`email`/`password`) y su catálogo de
clasificación (categorías y patrones), además de la ingesta ya habilitada por ADR-026. Toda
escritura que modifique las transacciones mismas queda fuera.**

Reglas que fija esta decisión:

1. **Mismos endpoints, misma sesión.** `PATCH /api/perfil`, `PATCH /api/perfil/password`,
   `GET/POST/PATCH/DELETE /api/categorias` y `/api/patrones`, con `Authorization: Bearer` +
   `x-api-key`. **No se crea ningún endpoint mobile-específico ni una segunda ruta de credenciales**
   (regla 2 de ADR-026, conservada).
2. **La frontera nueva, enunciable:** *lo propio del usuario y cómo se lee su dinero* entra;
   **las transacciones no**. Quedan explícitamente fuera: reclasificar transacciones, editar montos,
   borrar ingestas, y cualquier escritura sobre datos de otro usuario (imposible por RNF-SEC-006, y
   además fuera por regla).
3. **Sin lógica de negocio duplicada** (ADR-024): la validez de un bucket, la unicidad de nombres, el
   desempate `(prioridad, patron, id)` (ADR-036 D-08) y el efecto "las transacciones quedan sin
   categoría" son del backend. Mobile solo agrega presentación: agrupación por bucket, plurales,
   armado de la frase de impacto y las tablas de copy.
4. **Vinculación de Google sigue fuera de mobile.** ADR-035 acota la superficie de auth Google mobile
   a `POST /api/auth/google/token`. La pantalla de configuración muestra el estado del vínculo en
   **solo lectura**; vincular/desvincular desde mobile sería otra decisión.
5. **Sin modo demo en mobile** (regla 5 de ADR-026, conservada): mobile no puede crear una sesión
   demo, así que la UI proactiva de solo-lectura no se construye; el `403 DEMO_SOLO_LECTURA` se
   mapea defensivamente a copy y nada más.
6. **La frontera se amplía por ADR, nunca por PR.** Una escritura mobile que no encaje en la regla 2
   exige un ADR propio, igual que exigió éste.

---

## Alternativas consideradas

### Opción A — Mantener ADR-026 intacto: configuración solo en web

✅ Cero cambio de frontera; ADR-026 queda literal.
✅ Superficie mobile mínima (dos pantallas menos, cero formularios).
❌ **Deja el defecto de producto en pie:** cada fila «Sin categoría» que el usuario ve en el teléfono
es una tarea diferida a una sesión de escritorio que frecuentemente no ocurre.
❌ Obliga a cambiar de dispositivo para arreglar *lo que se está mirando* — la misma fricción que
ADR-026 corrigió para la captura, ahora del lado de la clasificación.
❌ La app ya escribe (ingesta): la frontera "mobile no escribe" **ya no describe la realidad**, así
que sostenerla es sostener una regla que no se cumple.

### Opción B — Paridad de escritura completa en mobile

Mobile puede además reclasificar transacciones, editar montos, borrar ingestas, crear sesiones demo.

✅ Experiencia "completa".
❌ **Scope creep sin demanda** (`yagni`): ninguna de esas superficies fue pedida para mobile, y
varias (reclasificar, borrar ingesta) tienen consecuencias sobre datos ya persistidos que en web
recién se estabilizaron tras varias rondas de review.
❌ Vuelve a dejar la frontera sin regla: "mobile hace todo" no es un límite, es la ausencia de uno.
❌ Costo de superficie nativa y de testing desproporcionado para un solo desarrollador.

### Opción C — Escritura acotada por regla: lo propio del usuario y cómo se lee su dinero ✅ (elegida)

Mobile gana **dos** superficies de escritura además de la ingesta: **el perfil del propio usuario** y
**su propio catálogo de clasificación**. Nada que edite las transacciones mismas.

✅ Cumple el requisito de producto (US-044) con el mínimo de superficie nueva.
✅ **Reusa endpoint, contrato, transporte y credencial existentes** — sin API nueva, sin secreto
nuevo, sin migración.
✅ Sustituye una lista de excepciones por una **regla enunciable** (ver Decisión), que permite decir
*no* con fundamento la próxima vez.
✅ Coherente con ADR-024: el dominio canónico sigue viviendo una sola vez en el backend; mobile solo
suma pantallas que consumen los mismos endpoints que web.
⚠️ Introduce formularios y confirmaciones destructivas en mobile — superficie de UX nueva, acotada a
dos pantallas y sin dependencias nativas más allá del set de iconos ya decidido (ADR-027).

---

## Seguridad

- **Sin credencial nueva ni superficie de secretos nueva:** el token de sesión ya vive en
  `expo-secure-store` y la `x-api-key` ya viaja por EAS Secrets. Las nuevas llamadas reusan
  `construirHeadersSesion()` verbatim.
- **El backend sigue siendo la autoridad de validación:** longitud de nombre, validez de bucket,
  unicidad case-insensitive, validez de la regex de un patrón y la fortaleza de la password nueva se
  imponen server-side. Toda validación de cliente es afordancia, no control.
- **Anti-enumeración preservada** (PERF040-04): password incorrecta y email ya tomado devuelven el
  mismo `403 PERFIL_RECHAZADO`, y el cliente mobile **nunca renderiza el `message` del servidor** —
  el texto sale de una tabla cerrada del cliente indexada por `status + code`.
- **Aislamiento por `userId` intacto** (RNF-SEC-006): todos los endpoints usados ya filtran por el
  usuario de la sesión; mobile no gana ninguna capacidad de leer o escribir datos ajenos.
- **Cambio de password revoca las demás sesiones** (comportamiento de US-040): un cambio desde el
  teléfono cierra la sesión web. La UI **debe** decirlo («Se cerraron tus otras sesiones.»), porque
  un cierre de sesión silencioso en otro dispositivo es una sorpresa de seguridad, no un detalle.
- **Confirmación obligatoria antes de una acción destructiva:** eliminar una categoría y cambiar su
  bucket exigen confirmación explícita con el impacto declarado (cuántas transacciones, en todos los
  períodos), incluso cuando el impacto es cero — el caso cero **suaviza la frase, no salta la
  confirmación**.
- **Sin PII nueva expuesta:** no se agregan campos ni endpoints; el email ya viajaba en
  `GET /api/auth/me`. El riesgo aceptado de ADR-013 no cambia.

---

## Consecuencias

**Positivas:**

- **Cierra el lazo del teléfono:** leer el 50/30/20, subir la cartola que lo alimenta y corregir la
  clasificación que lo determina pasan a ocurrir en el mismo dispositivo.
- **Reemplaza una lista de excepciones por una regla.** ADR-010 → ADR-026 → ADR-038 venía siendo una
  secuencia de grietas nombradas; a partir de acá hay un criterio ("lo propio del usuario y cómo se
  lee su dinero") contra el cual evaluar la próxima solicitud.
- **Costo casi todo de UI:** no toca dominio, API, contrato ni web. Rollback = revertir commits del
  cliente; nada queda inaccesible (todo lo creado desde mobile se sigue administrando desde web).

**A tener en cuenta:**

- **Duplicación de copy web ↔ mobile:** las advertencias destructivas y las tablas de error se
  escriben a mano en dos workspaces, porque ADR-008 descarta `packages/shared` deliberadamente. Se
  mitiga fijando cada string en un test unitario, de modo que una divergencia silenciosa se vuelva
  una edición intencional y revisable.
- **Presión de scope futura:** habilitar el catálogo va a invitar a pedir "¿y reclasificar también?".
  La regla 2 existe para poder responder con fundamento.
- **Superficie de UX nueva en mobile:** formularios controlados, confirmaciones nativas
  (`Alert.alert`) y estados de error por campo. Aplica ADR-017 (jest-expo + RNTL en CI; Maestro
  manual en dispositivo) y ADR-018 (a11y: el estado nunca solo por color, labels en español).
- **Primer icono lucide en mobile:** activa la Opción A de ADR-027, cuya dependencia
  (`lucide-react-native`) nunca se había instalado. Se instala con `npx expo install` para que Expo
  resuelva la versión compatible con el SDK, manteniendo la línea alineada con la `lucide-react` de
  web.

---

## No incluido en este ADR

- **Reclasificar transacciones, editar montos o borrar ingestas desde mobile** — fuera por la regla 2.
- **Vincular/desvincular Google desde mobile** — solo lectura del estado; sería otra decisión
  (ADR-034/ADR-035 acotan esa superficie).
- **Modo demo en mobile** — sigue siendo superficie web (regla 5 de ADR-026, conservada).
- **Una barra de navegación inferior en mobile** — el punto de entrada es un engranaje en el header;
  las bottom tabs son backlog (#394).
- **Sincronización de copy entre clientes mediante un paquete compartido** — descartado por ADR-008;
  el camino sancionado sigue siendo la generación desde `openapi.json` (ADR-011/012), que no cubre
  copy de UI.

---

## Referencias

- ADR-026 Ingesta desde mobile — decisión cuya **regla de alcance** este ADR supersede
- ADR-010 App Mobile — stack y arquitectura mobile, vigentes
- ADR-024 Arquitectura de Clientes — backend rico / clientes delgados: la regla que mantiene el
  dominio fuera de mobile
- ADR-036 / ADR-037 — catálogo por usuario e identidad de categoría como fila del usuario: por qué
  el catálogo es "lo propio del usuario"
- ADR-034 / ADR-035 — login con Google (web / mobile): por qué vincular queda fuera
- ADR-013 Cifrado de Datos en Reposo · ADR-008 Frontend Stack (sin `packages/shared`)
- ADR-017 Testing Mobile · ADR-018 Testing de Accesibilidad · ADR-027 Set de iconos (lucide)
- US-040 (perfil) · US-038 / US-039 (catálogo) · US-042 / US-043 (configuración web) · US-050
  (dashboard mobile) · US-044 — historia que origina la decisión

---

*Fecha de decisión: pendiente — se acepta al mergear la primera slice de US-044*
