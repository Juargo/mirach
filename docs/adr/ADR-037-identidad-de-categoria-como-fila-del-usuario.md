---
tags:
  - adr
  - fase-diseño
  - datos
proyecto: MoneyDiary
estado: ✅ Decidido
fecha_creacion: 2026-08-12
fecha_actualizacion: 2026-08-12
---

# ADR-037 — La identidad de una categoría es una fila propiedad del usuario, no un tipo de compilación

## Estado

✅ **Decidido** (change SDD `us-038-catalogo-crud`, PR #1 de 3 en Feature Branch Chain).

---

## Contexto

ADR-036 movió `Categoria`/`PatronClasificacion` de un set global de filas a un set de filas
propiedad de cada usuario (`userId` NOT NULL, copiado desde una plantilla en el momento de
alta). Esa migración fue deliberadamente **de ownership, no de identidad**: quién es dueño de
la fila cambió; qué hace válido a un nombre de categoría no. La validez seguía dependiendo,
en runtime, del enum cerrado `Categoria` (8 miembros) y del mapa total
`CATEGORIA_BUCKET: Record<Categoria, Bucket>` — ambos en `domain/value-objects/categoria.ts`
— y `openspec/specs/catalogo-clasificacion-ownership/spec.md` listaba explícitamente
*"Dismantling the closed `Categoria` TypeScript enum or the `CATEGORIA_BUCKET` total map — both
remain untouched"* como Non-Goal de US-037.

US-038 (CRUD de catálogo por usuario) obliga a revertir ese Non-Goal: si un usuario puede crear
una categoría nueva vía `POST /api/categorias`, el conjunto de nombres válidos deja de ser
cerrado y conocido en tiempo de compilación — pasa a ser el resultado de una query `WHERE
userId = ?`. Mantener el enum en paralelo a filas de usuario libres habría producido dos fuentes
de verdad divergentes sobre la misma pregunta ("¿qué categorías existen?").

## Decisión

**La identidad de una categoría es una fila propia del usuario** (`id`, `nombre`, `bucketId`),
no un miembro de un tipo cerrado. Se elimina `domain/value-objects/categoria.ts` completo:
el enum `Categoria`, el mapa `CATEGORIA_BUCKET` y la función `bucketDeCategoria`. `tsc --noEmit`
enumera cada sitio que dependía de ese tipo (~41 archivos, domain → application →
infrastructure → scripts de Prisma → specs) y cada uno se corrige en ese orden, guiado por el
compilador, no por `grep`.

**La garantía que se cede.** `Record<Categoria, Bucket>` era **total**: el compilador probaba
que ninguna categoría podía quedar sin bucket asignado. Esa prueba se reemplaza por la
constraint `NOT NULL` de `Categoria.bucketId` en el esquema — una garantía de runtime, no de
tipos. El compilador retiene la prueba de totalidad **solo para la plantilla** semilla, vía el
tipo `CategoriaTemplateNombre = (typeof CATEGORIA_TEMPLATE)[number]['nombre']`: el patrón que
la plantilla define para un nombre fuera de la propia plantilla sigue sin compilar. Sobre datos
de usuario, ninguna prueba de compilación es posible por definición — su integridad la dan
`NOT NULL bucketId` + `@@unique([userId, nombre])` + la FK compuesta de ADR-036.

**Consecuencia sobre el backfill.** `prisma/backfill-categorias.ts` pierde su última
dependencia en runtime de `CATEGORIA_IDS`: el `categoriaId` que escribe pasa a venir de la fila
de patrón que matcheó (`categoria?.id ?? null`), no de un mapa estático nombre→id. El script se
mantiene congelado y acotado a `USER_ID_FIJO` (ADR-036 D-10) en ambos lados, lectura y
escritura — esta decisión no reabre esa acotación.

## Alternativas consideradas

1. **Mantener el enum como "hint de nombres conocidos" junto a filas libres.** Rechazada: el
   enum dejaría de ser exhaustivo el día que exista una sola categoría creada por el usuario,
   pero seguiría existiendo en el código invitando a alguien a volver a usarlo como fuente de
   verdad (ya pasó una vez con `foldCategoriaId`, ADR-036 D-09). Un tipo que miente sobre ser
   cerrado es peor que no tener tipo.
2. **Tipo `string` con marca (`branded type`) sobre el nombre.** Rechazada: una marca de tipo no
   impone ninguna regla en runtime — se puede construir con un `as` sin pasar por ninguna
   validación — y aquí toda la validez real vive en la base de datos (unicidad por usuario,
   FK compuesta). La marca habría sido decoración sin garantía.
3. **Validación en runtime contra un set de nombres por usuario, calculado en cada operación.**
   Rechazada por redundante: eso es exactamente lo que ya hace una consulta `WHERE userId = ?`
   contra `Categoria`. Construir una capa de validación paralela que recalcule ese mismo set
   solo para volver a preguntarle "¿este nombre es tuyo?" duplica la fuente de verdad sin
   agregar ninguna garantía que la fila en sí no dé ya.

## Consecuencias

- `domain/value-objects/patron-clasificacion.ts` pasa a anidar `categoria: { id, nombre, bucket
  }` en vez de depender del enum; `coincide()` — incluido el `try/catch` de REGEX malformada —
  queda byte-idéntico (guardrail de este cambio).
- `application/use-cases/categorizar-transaccion.use-case.ts` retorna `{ id, nombre } | null` en
  vez de un miembro del enum; el desempate `(prioridad, patron, id)` de ADR-036 D-08 queda sin
  tocar.
- `infrastructure/persistence/catalogo-template.ts` conserva la única prueba de compilación que
  sigue teniendo sentido económico: la consistencia interna de la plantilla semilla, vía
  `CategoriaTemplateNombre`.
- Cualquier PR futuro que intente reintroducir un enum cerrado de nombres de categoría para
  "simplificar" una validación rompe la compilación contra este ADR, no solo el comportamiento
  — la misma defensa que ADR-036 D-09 dejó para `foldCategoriaId`.
- Ver ADR-036 (`## Consecuencias`) para el puntero hacia adelante desde la decisión de
  ownership hacia esta decisión de identidad.
