---
tags:
  - adr
  - fase-diseño
  - mobile
  - ingesta
  - clasificacion
proyecto: MoneyDiary
estado: ✅ Decidido
fecha_creacion: 2026-09-13
fecha_actualizacion: 2026-09-13
---

# ADR-044 — Clasificación previa al commit en mobile: reclasificar transacciones propias y elegir categoría antes de confirmar una ingesta

## Estado

✅ **Decidido** (2026-09-13, aceptado por el owner; change SDD `cartola-preview-confirmacion`,
PR1) — **supersede una sola regla de ADR-038**.

> [!info] Relación con ADR-038
> No reemplaza a ADR-038 Alcance de escritura de la app mobile: la vinculación de Google
> solo-lectura, la ausencia de modo demo y la regla de "sin lógica de negocio duplicada" siguen
> **vigentes tal cual**. Este ADR supersede **una sola frase de una sola regla** suya — la regla 2
> de su Decisión: *"Quedan explícitamente fuera: **reclasificar transacciones**, editar montos,
> borrar ingestas, y cualquier escritura sobre datos de otro usuario."* Este ADR retira
> "reclasificar transacciones" de esa lista; el resto de la regla 2 (editar montos, borrar
> ingestas, escritura ajena) sigue fuera sin cambios.
>
> Se sigue el mismo patrón con el que ADR-038 enmendó a ADR-026: el ADR viejo **no se edita**
> (convención de `docs/adr/README.md`), la relación se declara acá y el índice anota la regla
> parcialmente superseded.

---

## Contexto

ADR-038 (2026-08-20) fijó la frontera de escritura mobile con una regla enunciable: *lo propio del
usuario y cómo se lee su dinero* entra, las transacciones no. Su regla 2 nombró explícitamente
"reclasificar transacciones" como excluida, y su regla 6 fijó el mecanismo de cambio: *"la frontera
se amplía por ADR, nunca por PR"*.

Dos hechos, ambos verificables en el repo, exigen resolver esto explícitamente:

1. **US-056 ya shippeó reclasificación mobile, sin citar ADR-038.** El change archivado
   `2026-08-21-us-056-mobile-detalle-mes` entregó `ReclasificarMobileControl` (Modal con
   bucket → categoría, reusa el patrón `Alert.alert` de us-044) y `reclasificarCategoria()` en
   `apps/mobile/src/api/categorias.ts`, que llama `PATCH /api/transacciones/:id/categoria`. Es el
   mismo endpoint y el mismo aislamiento por `userId` (RNF-SEC-006) que usa web; no hay superficie
   nueva de backend. Su proposal/design nunca mencionan ADR-038 — la regla 6 no se siguió, y la
   frontera quedó en un estado que el ADR vigente contradice.
2. **`cartola-preview-confirmacion` (este change) agrega una segunda superficie del mismo tipo.**
   Durante la revisión de una cartola, antes de confirmar, el usuario puede tocar una fila
   editable y elegir su categoría; el commit final (`POST /api/ingestas/commit`) envía esa
   elección como un overlay `edits: [{ rowIndex, categoriaId }]`. Esto es clasificación elegida
   **como parte del flujo de ingesta que ADR-026 ya autoriza** — no una puerta de escritura nueva
   — pero como implica escoger una categoría para una transacción, cae bajo el mismo texto literal
   de la regla 2 de ADR-038.

Sin resolver esto, el texto del ADR y el código shippeado siguen divergiendo, y la próxima US que
toque clasificación mobile hereda la misma ambigüedad.

---

## Decisión

**La app mobile puede clasificar transacciones que le pertenecen, en dos superficies ya
existentes o habilitadas por otros ADRs:**

1. **Reclasificar una transacción propia ya persistida**, vía `PATCH
   /api/transacciones/:id/categoria` (ratifica US-056, que ya lo shippeó).
2. **Elegir la categoría de una fila antes de confirmar una ingesta**, durante la revisión de
   cartola, vía el overlay `edits` de `POST /api/ingestas/commit` (parte del flujo de ingesta que
   ADR-026 ya autoriza).

Ambas superficies reusan endpoint, sesión y credencial existentes (`Authorization: Bearer` +
`x-api-key`, precedente de ADR-026 regla 2 / ADR-038 regla 1) — **no se crea ningún endpoint
mobile-específico**. Ambas quedan acotadas a las transacciones del propio usuario autenticado
(RNF-SEC-006).

### Límites — lo que sigue explícitamente fuera

- **Filas `Ingreso` no son editables.** `CommitIngestaUseCase` (Regla 2, D-11) trata `Ingreso`
  como inmutable server-side: cualquier entrada del overlay sobre una fila `Ingreso` se ignora en
  silencio, gane o no el bucket auto-clasificado. Este ADR no cambia esa invariante — solo declara
  que mobile puede elegir para las filas que **sí** son editables.
- **Filas duplicadas no son editables** — se excluyen de la persistencia por completo (CMT-02); no
  hay categoría que asignarles.
- **Editar montos, fechas o descripciones** sigue fuera — los campos parseados por el servidor son
  autoritativos (CMT-01); el overlay solo reasigna clasificación.
- **Borrar ingestas** sigue fuera.
- **Crear una categoría nueva desde la revisión mobile ("+ Nueva categoría")** sigue fuera —
  diferido explícitamente por el proposal de `cartola-preview-confirmacion`.
- **Sin lógica de negocio duplicada** (ADR-024, regla 3 de ADR-038, sin cambios): la validez de un
  `categoriaId` ajeno (CMT-03), el desempate de patrones (ADR-036 D-08) y la inmutabilidad de
  `Ingreso` siguen siendo del backend. Mobile solo presenta bucket/categoría y arma el overlay.

---

## Alternativas consideradas

### Opción A — Corregir solo la fila de `CLAUDE.md`

✅ Cambio mínimo, un archivo.
❌ El texto de ADR-038 seguiría contradiciendo el código shippeado (US-056) y la regla 6 exige un
ADR para ampliar la frontera, no una edición de tabla resumen — dejar solo la fila de `CLAUDE.md`
corregida sin un ADR propio repite exactamente el drift que causó este problema.

### Opción B — Un ADR retroactivo que cubra solo US-056, sin la elección pre-commit de este change

✅ Ratifica lo ya shippeado con el mínimo alcance.
❌ Deja la superficie nueva de `cartola-preview-confirmacion` (el overlay de clasificación en la
revisión de ingesta) sin ADR propio, repitiendo el mismo patrón de escritura-antes-de-decisión que
motivó este documento — la próxima auditoría encontraría el mismo drift, una US más tarde.

### Opción C — Un ADR que cubre ambas superficies de clasificación mobile ✅ (elegida)

Reclasificar transacciones propias (US-056, retroactivo) y elegir categoría antes de confirmar una
ingesta (esta change, prospectivo) comparten la misma naturaleza: clasificación de una transacción
propia, sin lógica de negocio nueva, reusando endpoint y sesión existentes.

✅ Cierra el drift retroactivo de US-056 y cubre la superficie nueva de este change en el mismo
documento, siguiendo la regla 6 de ADR-038 desde el PR1 de este change, no al archivar.
✅ Coherente con ADR-024: el dominio canónico (inmutabilidad de `Ingreso`, validación cross-tenant,
desempate de patrones) sigue viviendo una sola vez en el backend.
⚠️ Amplía la frontera de ADR-038 en un punto — asumido: "reclasificar transacciones" deja de ser
una exclusión absoluta y pasa a estar acotada a transacciones propias, filas no-`Ingreso` y
no-duplicadas.

---

## Alcanza (Supersedes) — exactamente la cláusula listada, nada más

Siguiendo el patrón de scoped-supersede que ADR-038/039/040/041/042/043 ya usan (el ADR viejo no
se edita; la relación se declara acá):

- **ADR-038, regla 2 de la Decisión — solo la frase "reclasificar transacciones".** Deja de estar
  excluida para mobile, acotada a transacciones propias, filas no-`Ingreso` y no-duplicadas. El
  resto de la regla 2 (editar montos, borrar ingestas, escritura sobre datos de otro usuario) sigue
  vigente sin cambios.
- **ADR-038, regla 6 — se satisface, no se enmienda.** Este ADR es exactamente el mecanismo que la
  regla 6 exige para ampliar la frontera ("por ADR, nunca por PR").

**No enmienda** (para que el próximo lector no tenga que re-derivarlo): el resto de ADR-038
(reglas 1, 3, 4, 5 — mismos endpoints/sesión, sin lógica duplicada, Google solo lectura, sin modo
demo); ADR-026 (la capacidad de ingesta sigue vigente sin cambios — este ADR solo aclara que elegir
categoría es parte de ese flujo); ADR-024 (el dominio canónico sigue en el backend); ADR-036/037
(catálogo por usuario, identidad de categoría); ADR-042 (la reclasificación identifica la categoría
por `categoriaId`, no por `nombre` — `reclasificarCategoria()` ya lo hace así).

---

## Seguridad

- **Sin credencial ni endpoint nuevo:** ambas superficies reusan `Authorization: Bearer` +
  `x-api-key` ya vigentes (ADR-026 regla 2, ADR-038 regla 1).
- **Aislamiento por `userId` intacto** (RNF-SEC-006): `PATCH /api/transacciones/:id/categoria` y
  `POST /api/ingestas/commit` ya filtran por la sesión del caller; este ADR no cambia esa
  autoridad.
- **`Ingreso` sigue siendo inmutable server-side** (CommitIngestaUseCase Regla 2) y **`categoriaId`
  cross-tenant sigue siendo rechazado** (CMT-03) — ambos son invariantes del backend que este ADR
  no toca; mobile no gana ninguna capacidad de sortearlos.
- **Sin PII nueva expuesta:** ninguna de las dos superficies agrega campos ni endpoints.

---

## Consecuencias

**Positivas:**

- **US-056 queda ratificado, sin editar su ADR de referencia** (que no citaba ninguno) ni el
  archivo de ADR-038.
- **El overlay de clasificación pre-commit de `cartola-preview-confirmacion` queda cubierto desde
  su PR1**, no como un hallazgo de archivo.
- **Costo cero de dominio, API o contrato:** ambas superficies ya existían server-side; este ADR
  es documentación de una frontera, no una decisión de construir algo nuevo.

**A tener en cuenta:**

- **La regla enunciable de ADR-038 ("lo propio del usuario y cómo se lee su dinero") ahora incluye
  clasificación**, no solo perfil y catálogo — el próximo pedido de escritura mobile debe evaluarse
  contra esta frontera ampliada, no contra el texto original de ADR-038.
- **Drift de documentación como riesgo recurrente:** esta es la segunda vez que código mobile
  amplía una frontera de escritura sin citar el ADR vigente (la primera fue US-056 mismo). Ningún
  mecanismo automatizado lo detecta hoy; sigue dependiendo de que la próxima change SDD haga el
  chequeo de ADR Impact.

---

## No incluido en este ADR

- **Editar montos, fechas o descripciones desde mobile** — sigue fuera (CMT-01, campos parseados
  por el servidor).
- **Borrar ingestas desde mobile** — sigue fuera.
- **Crear una categoría nueva desde la revisión mobile** — diferido, fuera de alcance de
  `cartola-preview-confirmacion`.
- **Reclasificar o clasificar transacciones/filas de otro usuario** — imposible por RNF-SEC-006, y
  además fuera por regla.
- **Cualquier otra superficie de escritura mobile no listada acá** — sigue exigiendo su propio ADR
  (ADR-038 regla 6, sin cambios).

---

## Referencias

- ADR-038 Alcance de escritura de la app mobile — regla 2 (parcial) y regla 6 aplicadas acá
- ADR-026 Ingesta desde mobile — flujo que ya autoriza el commit del que este ADR aclara el overlay
  de clasificación
- ADR-024 Arquitectura de Clientes — sin lógica de negocio duplicada
- ADR-036 / ADR-037 — catálogo de clasificación por usuario, identidad de categoría
- ADR-042 — unicidad de categoría por bucket; la reclasificación identifica por `categoriaId`
- US-056 (`openspec/changes/archive/2026-08-21-us-056-mobile-detalle-mes/`) — reclasificación
  mobile ya shippeada, ratificada retroactivamente por este ADR
- change SDD `cartola-preview-confirmacion` (issue #295) — origina la superficie de clasificación
  pre-commit

---

*Fecha de decisión: 2026-09-13 — aceptada por el owner antes de iniciar la implementación de
`cartola-preview-confirmacion`, PR1 (este ADR + índices).*
