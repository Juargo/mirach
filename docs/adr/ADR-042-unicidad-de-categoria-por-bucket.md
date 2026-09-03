---
tags:
  - adr
  - fase-diseño
  - datos
  - seguridad
proyecto: MoneyDiary
estado: ✅ Decidido
fecha_creacion: 2026-08-31
fecha_actualizacion: 2026-08-31
---

# ADR-042 — Unicidad de `Categoria` pasa de `(userId, nombre)` a `(userId, bucketId, nombre)`

## Estado

✅ **Decidido** (change SDD `categoria-unica-por-bucket`, 4 PRs encadenados en Feature
Branch Chain). Este documento cubre la decisión completa; PR1 entrega únicamente el corte
duro del contrato de reclasificación (`categoriaId`) bajo la restricción *actual*
`(userId, nombre)` — la migración de esquema, el gate bucket-scoped y las pruebas
decisivas llegan en PR4.

---

## Contexto

ADR-036 movió `Categoria` de un set global a un set de filas propiedad de cada usuario,
con `@@unique([userId, nombre])`: un usuario no puede repetir un nombre de categoría, pero
dos usuarios sí pueden compartir uno. ADR-037 retiró el enum cerrado `Categoria` — la
validez de una categoría dejó de ser un tipo de compilación y pasó a ser una fila con
`bucketId NOT NULL`.

Ninguna de las dos decisiones cuestionó **dentro de qué alcance** un nombre debe ser
único. US-038 (CRUD de catálogo por usuario) expone esa pregunta como un requisito de
producto real: un usuario quiere poder llamar "Streaming" tanto a una suscripción en
`Necesidades` (el plan familiar del hogar) como a una en `Deseos` (su propio Netflix), y
hoy el `@@unique([userId, nombre])` se lo impide sin ninguna razón de negocio — el nombre
es arbitrario, el bucket es la partición con significado.

Resolver esto exige tocar el mismo seam que ADR-037 dejó documentado como riesgoso: el
endpoint de reclasificación (`PATCH /api/transacciones/:id/categoria`) resolvía la
categoría destino por `(userId, nombre)`. En cuanto el nombre deje de ser único dentro del
catálogo de un usuario, esa resolución por nombre puede devolver **cualquiera** de las
filas homónimas, elegida por la base de datos — dinero clasificado en el bucket
equivocado, sin excepción, sin `400`, sin línea de log (ver design.md D-05).

## Decisión

La unicidad de `Categoria` pasa de `(userId, nombre)` a `(userId, bucketId, nombre)`: un
usuario **puede** repetir un nombre de categoría entre buckets y **nunca** dentro de uno.
Como consecuencia directa —un nombre deja de identificar una categoría— el contrato de
reclasificación (`PATCH /api/transacciones/:id/categoria`) identifica la categoría por
`categoriaId` en vez de por `nombre`, en corte duro y sin alias de transición. La
verificación de unicidad de la capa de aplicación (`existeNombre`) se vuelve
bucket-scoped y se ejecuta también en el PATCH de re-bucketeo, donde hoy no corre —
cerrando una brecha latente que hoy es inofensiva (dos nombres no pueden colisionar) y
que la migración vuelve real.

**Secuenciación como restricción de corrección, no de preferencia (D-01):** el contrato
migra a `categoriaId` ANTES de relajar el índice de la base de datos, en PR1-3; la
restricción se relaja recién en PR4, después de que ambos clientes (web, mobile) ya
identifican por id. Invertir el orden abre una ventana en la que los nombres son
ambiguos y el write path todavía resuelve por nombre — exactamente el escenario de
misclasificación silenciosa descrito arriba. Ningún commit en `main` puede contener a la
vez un lookup de escritura por nombre y el índice relajado.

## Alcanza (Supersedes) — exactamente dos cláusulas, nada más

Siguiendo el patrón de scoped-supersede de ADR-038/039/040 (el ADR viejo no se edita; la
relación se declara acá):

- **ADR-036.** La decisión de ownership (copiar la plantilla per-user, `userId NOT NULL`
  en ambas tablas, la FK compuesta `(categoriaId,userId) → Categoria(id,userId)`, el
  desempate `(prioridad, patron, id)`) sigue **completamente vigente sin cambios**. Lo que
  este ADR enmienda es la clave de unicidad que la migración de ADR-036 dejó fijada en el
  esquema: `schema.prisma`, comentario del modelo `Categoria` (introducido junto con
  `userId NOT NULL` en esa migración) — *"`nombre` ya NO es único globalmente: la
  unicidad vive en (userId, nombre)"* — pasa a *"la unicidad vive en (userId, bucketId,
  nombre)"*. Nota de honestidad: ADR-036 (el documento) nunca deletreó la sintaxis exacta
  del índice en su propia prosa — la cláusula que se enmienda es la del artefacto que esa
  decisión produjo (el comentario del esquema y el índice `@@unique([userId, nombre])`
  que trajo consigo), no una oración literal del archivo `ADR-036-*.md`.
- **ADR-037**, la cláusula exacta *"la validez de una categoría pasa a ser `NOT NULL
  Categoria.bucketId` + `@@unique([userId, nombre])` + FK compuesta"* — únicamente el
  término `@@unique([userId, nombre])`. **Explícitamente sigue vigente:** el retiro del
  enum cerrado `Categoria` y de `CATEGORIA_BUCKET`; la validez de una categoría sigue
  siendo una propiedad de fila, no un tipo cerrado — este cambio hace esa afirmación *más*
  cierta, no menos, porque ahora ni siquiera el nombre es una clave estable.

**No enmienda** (para que el próximo lector no tenga que re-derivarlo): ADR-011/012 (este
es exactamente el contrato generate-don't-hand-sync que esos ADRs anticipan — ver nota
sobre ADR-012 más abajo); ADR-022/023 (la app mobile desactualizada que siga enviando
`{ categoria: <nombre> }` recibe un `400` limpio tras el corte, nunca una escritura
incorrecta — el runbook de reconstrucción de APK ya es un paso conocido); ADR-015 (el test
de integración decisivo de PR4 es exactamente el gate de riesgo-en-el-dinero que este ADR
justifica); ADR-024 (ningún bucket ni regla de unicidad se duplica en los clientes — ambos
siguen enviando un id opaco).

## Consecuencias

- **El campo `nombre` de `CategoriaDesconocidaError` se renombra a `categoriaId`** (PR1):
  seguía siendo un nombre en el dominio; ahora es un id, y un error de dominio que mintiera
  sobre su propio campo sería exactamente el tipo de deuda silenciosa que este cambio existe
  para evitar.
- **`existeNombre` (capa de aplicación) se vuelve bucket-scoped y gana forma de objeto**
  (`{ userId, nombre, bucket, excluirId? }`, PR4) — la forma posicional se rechaza
  explícitamente en el diseño por un riesgo de miscompilación silenciosa (ver design.md
  D-02): insertar `bucket` como tercer parámetro posicional habría dejado compilar el call
  site existente de `ActualizarCategoriaUseCase` pasando un id de categoría donde se
  esperaba un nombre de bucket.
- **`ActualizarCategoriaUseCase` cierra su brecha de PATCH bucket-only** (PR4): hoy la
  unicidad solo se verifica cuando el PATCH trae `nombre`; la migración arma un bug
  latente (un re-bucketeo hacia un bucket que ya tiene ese nombre pasaría sin chequeo,
  hasta chocar con el índice crudo de Postgres como un `500`) que este mismo cambio cierra
  en la misma pieza de trabajo.
- **Ningún bucket ni regla de unicidad cruza hacia los clientes** (ADR-024): web y mobile
  siguen enviando un `categoriaId` opaco; el servidor sigue siendo la única autoridad sobre
  qué fila es y a qué bucket pertenece.

## No incluido en este ADR

- **La migración de esquema, el gate bucket-scoped de `existeNombre`, y las pruebas
  decisivas de aislamiento cross-bucket/cross-user** — PR4 (D-01: debe ser el último PR de
  la cadena; la restricción relajada antes de que ambos clientes migren reabriría la
  ventana de riesgo que la secuenciación cierra).
- **Copy activa sugiriendo "podés usar ese nombre en otro bucket"** — pregunta de producto
  abierta (proposal.md), no resuelta acá; las strings de error actuales son el default
  silencioso mientras tanto.

## Referencias

- ADR-036 — Catálogo de clasificación por usuario: ownership **sigue vigente sin
  cambios**; solo la clave de unicidad del esquema que su migración dejó fijada se amplía
- ADR-037 — Identidad de categoría como fila del usuario: la cláusula `@@unique([userId,
  nombre])` de su texto **se enmienda**; el resto se reafirma
- ADR-038/039/040 — precedente de scoped-supersede seguido acá (el ADR viejo no se edita)
- ADR-005 — Clean Architecture: `bucket` viaja por el port como nombre validado; solo el
  adapter Prisma conoce `BUCKET_IDS`
- ADR-011/012 — Contrato-first + `@moneydiary/api-client`: el contrato de reclasificación
  se regenera (`openapi:emit` + `api-client generate`) en el mismo PR que el esquema Zod
- ADR-015 — Verificación por capas: el test de integración de PR4 contra Postgres real
  (no un mock) es el gate que esta decisión exige para la propiedad "qué fila devuelve la
  base de datos", que ningún mock puede probar
- ADR-024 — Arquitectura de clientes: la regla de unicidad y el bucket no se duplican en
  web/mobile

---

*Fecha de decisión: 2026-08-31 — change SDD `categoria-unica-por-bucket`, PR1 (contrato de
reclasificación → `categoriaId`, corte duro). PR2 (web) y PR3 (mobile) completan el
cutover de clientes; PR4 (esquema + gate bucket-scoped + pruebas decisivas) cierra la
decisión bajo la restricción D-01.*
