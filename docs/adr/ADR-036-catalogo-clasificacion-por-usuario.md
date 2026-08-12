---
tags:
  - adr
  - fase-diseño
  - seguridad
  - datos
proyecto: MoneyDiary
estado: ✅ Decidido
fecha_creacion: 2026-08-11
fecha_actualizacion: 2026-08-11
---

# ADR-036 — Catálogo de clasificación por usuario (copy-on-signup)

## Estado

✅ **Decidido e implementado** (change SDD `us-037-catalogo-per-user`, 7 PRs encadenados en Feature Branch Chain, #296-#302). El **despliegue a producción queda pendiente** de que la tarea 6.9 (ensayo de migración contra un snapshot restaurado de prod) pase — ver "Pendiente antes de producción" más abajo.

---

## Contexto

`Categoria` y `PatronClasificacion` eran, hasta este cambio, un **único set de filas global**: 8 categorías y ~20 patrones compartidos por todos los usuarios, con ids fijos (`categoria-supermercado`, `pat-farmacia`, …) definidos en `prisma/seed.ts` y referenciados en tiempo de ejecución a través de un mapa estático (`CATEGORIA_IDS` / `foldCategoriaId`). Esto era coherente con un producto mono-usuario, pero rompe en cuanto existe más de un usuario real: no hay forma de que dos usuarios tengan catálogos independientes, y cualquier lectura que "resuelva" un id físico contra ese mapa estático falla en silencio para cualquier fila que no pertenezca al usuario bootstrap.

US-037 mueve ambas tablas de "set global" a **set de filas propiedad de un usuario**, materializado copiando una plantilla definida en código en el momento de creación del usuario (bootstrap vía seed, usuarios demo vía el flujo de creación existente). Es una **migración de ownership, no una feature**: sin CRUD, sin endpoint nuevo, sin cambio de UI ni de frontend — los nombres de categoría se preservan por construcción.

Restricciones vigentes que condicionan la solución:

1. **ADR-005:** la regla de dependencias `domain ← application ← infrastructure` se mantiene; el cambio no introduce capas nuevas.
2. **RNF-SEC-006 (aislamiento multi-tenant):** todo repo que devuelve datos de usuario filtra por `userId` en el `WHERE`, nunca en memoria — este catálogo debe cumplir la misma regla que ya rige `Ingesta`/`Transaccion`.
3. **Precedente `add_cargo_abono_check` / `backfill_patron_categoria`:** convención de migración en un solo directorio, SQL crudo donde Prisma no puede expresar el constraint.
4. **Producción de un solo usuario real hoy** (más usuarios demo efímeros) — el backfill se apoya en esa realidad y se niega a correr si deja de ser cierta.

## Decisión

Copiar la plantilla de catálogo (código, no filas de BD) a cada usuario nuevo, con `userId` como columna NOT NULL en ambas tablas y aislamiento reforzado por una FK compuesta. Diez decisiones de diseño, D-01 a D-10:

### D-01 — Plantilla como código, en un módulo de infraestructura dedicado

La plantilla vive en `apps/api/src/infrastructure/persistence/catalogo-template.ts` como constantes a nivel de módulo derivadas del enum `Categoria` + `CATEGORIA_BUCKET` + `BUCKET_IDS` de dominio. **No** es un set de filas en la BD y **no** pertenece a un usuario sentinela. Un "usuario plantilla" obligaría a que toda query, ruta de auth, job de limpieza y futuro listado de admin recuerde excluirlo, sin nada que fuerce esa exclusión — un impuesto permanente por una flexibilidad (editar la plantilla en caliente) que ninguna necesidad actual pide (YAGNI). Alternativa rechazada: dejar la plantilla dentro de `prisma/seed.ts` — ese script importa `dotenv`, adapters de Prisma y el gate de db-safety; importarlo desde código de runtime arrastraría ese grafo entero al bundle del server.

**Consecuencia aceptada:** el catálogo de cada usuario es una foto fija en el tiempo; ediciones futuras de la plantilla no se propagan a usuarios ya creados. Aceptable mientras el catálogo sea un enum cerrado.

### D-02 — El hook de copia es una función transaccional simple, no un port

`copiarCatalogoTemplate(tx, userId)` es una función exportada en `catalogo-template.ts`. Sin interfaz en `application/ports/`, sin use case, sin registro en el composition root. Un port se justifica por un cruce de capas o por testabilidad real; ninguno aplica: los dos call sites (`prisma/seed.ts`, `PrismaDemoRepository`) ya son código de persistencia, no hay consumidor de application, y la operación no lleva regla de negocio más allá de "materializar la plantilla". Una interfaz con una sola implementación y cero consumidores alternativos es la violación de libro de YAGNI. Cuando aparezca un use case de signup real, su adapter de repositorio llamará a esta misma función, y solo entonces un port queda justificado.

### D-03 — Sin cambios en el composition root

`composition/container.ts` y los helpers `crear-*` quedan intactos. El hook de copia es una función llamada por un adapter ya cableado (`PrismaDemoRepository`), no un colaborador inyectado. Los repositorios reescritos mantienen su firma de constructor: `userId` viaja como **parámetro de método**, nunca como estado de constructor, porque una instancia de repositorio es un singleton compartido entre requests y debe permanecer sin estado por tenant.

### D-04 — `PatronClasificacion.userId` es una columna real; la integridad la da la FK compuesta

`PatronClasificacion` gana una columna `userId` directa (no solo derivable vía join a `Categoria`). El invariante `Patron.userId = Patron.categoria.userId` lo aplica una **FK compuesta** `(categoriaId, userId) → Categoria(id, userId)`, respaldada por `Categoria @@unique([id, userId])`. La columna denormalizada replica el precedente ya establecido de `Ingesta.userId`: el aislamiento autoritativo vive en la propia fila. Un filtro basado en join (`categoria: { userId }`) está a un refactor de distancia de desaparecer en silencio; un `WHERE "userId" = $1` sobre la fila, no.

### D-05 — Backfill sin repuntar ningún `Transaccion.categoriaId`

Las filas del catálogo global existente conservan sus ids (`categoria-supermercado`, …) y solo ganan `userId = <usuario bootstrap>`. Nada se renumera; ninguna FK de `Transaccion` se mueve. Repuntar FKs adyacentes al dinero es la operación de mayor riesgo disponible y no compra nada: el usuario bootstrap ya es el dueño legítimo de esas filas.

### D-06 — FK compuesta: forma primaria, gate de validación y fallback

Modelada en `schema.prisma` como relación multi-campo de Prisma, con una forma deliberada para evitar el único constructo genuinamente riesgoso: **un campo escalar participando en dos relaciones a la vez**. Por eso `PatronClasificacion` **no** declara una relación `user User @relation(...)` propia, y `User` gana `categorias Categoria[]` pero **no** `patrones PatronClasificacion[]`. La integridad hacia `User` sigue siendo total, transitivamente: `Patron.(categoriaId,userId) → Categoria.(id,userId) → Categoria.userId → User.id`.

**Gate de validación (ejecutado antes de escribir código contra el esquema):** `prisma validate` + inspección del SQL emitido para confirmar el `FOREIGN KEY ("categoriaId","userId") REFERENCES "Categoria"("id","userId")`.

**Resultado real (tarea 1.2): el gate PASÓ.** La FK compuesta está viva en el esquema y en la migración aplicada. **El fallback (FK simple `categoriaId → Categoria(id)` + test de invariante) NO se tomó** — no aplica ninguna precondición derivada de esa rama a US-038.

### D-07 — Dos escritores para una sola plantilla: `copiar` (usuarios nuevos) vs. `sembrar` (usuario bootstrap)

Las constantes de plantilla están definidas una sola vez, pero hay **dos** escritores: `copiarCatalogoTemplate(tx, userId)` (usado por `PrismaDemoRepository.crear` y por un futuro signup; ids `cuid()` generados; `createMany`, no idempotente, una vez por usuario nuevo) y el bloque de catálogo inline de `runSeed` (solo `prisma/seed.ts`; ids fijos `CATEGORIA_IDS`/`PATRON_ID_FIJO`; `upsert`, idempotente, los ids nunca se mueven). Unificarlos en una función con un flag `ids?` habría sido la unificación de "5 parámetros y 3 flags" que la skill DRY advierte como peor que la duplicación — el conocimiento que no debe divergir es el *contenido* de la plantilla (single-sourced en `catalogo-template.ts`), no la *estrategia* de escritura.

### D-08 — El desempate de clasificación deja de depender del id surrogate

`CategorizarTransaccionUseCase` ordena patrones por `(prioridad asc, patron asc, id asc)` en vez de `(prioridad asc, id asc)`. El desempate por `id` solo era determinista porque, en el catálogo global, cada id era un slug escrito a mano (`pat-farmacia`) compartido por todos los usuarios. Con copias por usuario los ids pasan a ser `cuid()`s: dos usuarios con catálogos idénticos resolverían una colisión de igual prioridad de forma distinta, y distinta en cada re-copia. `patron` (el texto del patrón) es estable, independiente del usuario, significativo para el negocio y único dentro de la plantilla; `id` se conserva solo como desempate final para garantizar un orden total. Impacto de comportamiento nulo en la práctica: en el grupo de prioridad 20 el orden por id y el orden por texto ya coincidían.

### D-09 — `foldCategoriaId` se elimina, no se adapta (migración forzada por el compilador)

`CATEGORIA_ID_TO_CATEGORIA` y `foldCategoriaId` se **eliminan** de `categoria-ids.ts`. Un nuevo `fold-categoria.ts` exporta `foldCategoria(row)`, que resuelve por `nombre`. `categoria-ids.ts` conserva solo `CATEGORIA_IDS`, redocumentado como *ids de seed/bootstrap y de migraciones históricas, nunca un mecanismo de resolución en runtime*. Eliminar en vez de reescribir in situ hace que `tsc` — no un `grep` de revisor — encuentre cada call site huérfano: es el riesgo más alto identificado en la propuesta ("fold-to-null silencioso en rutas de lectura": sin error, las categorías simplemente desaparecen para todo usuario que no sea el bootstrap).

### D-10 — `prisma/backfill-categorias.ts` debe quedar acotado y congelado

El script one-off de backfill de US-013 seleccionaba `transaccion.findMany({ where: { categoriaId: null } })` **globalmente** y escribía `CATEGORIA_IDS[categoria]`. Tras este cambio, correrlo estamparía los ids de categoría del usuario bootstrap sobre transacciones **de otros usuarios** — corrupción cross-tenant, exactamente lo inverso de RNF-SEC-006. Se le añadió un filtro explícito `account: { userId: USER_ID_FIJO }` más un docblock marcándolo congelado y exclusivo del usuario bootstrap.

**Endurecido más allá de la redacción literal del diseño (hallazgo de judgment-day en PR #301):** la revisión adversarial demostró un secuestro cross-tenant latente de prioridad de patrones — el script cargaba el catálogo de patrones (`patronClasificacion.findMany`) sin acotar por usuario, así que un patrón de mayor prioridad perteneciente a **otro** usuario podía ganarle al patrón correcto del usuario bootstrap al clasificar una transacción de este último. Se cerró acotando también la lectura de patrones a `USER_ID_FIJO`. El diseño original (§10.2 de `design.md`) solo pedía acotar la query de `Transaccion`; este ADR registra el alcance ampliado como la forma correcta e implementada.

---

## Preguntas abiertas resueltas (§10 de `design.md`)

**Usuarios demo preexistentes:** se purgan dentro de la propia migración (Paso 1), con el mismo orden de borrado que `DemoCleanupService` (`Session → Transaccion → Ingesta → Account → User`, filtrado por `esDemo = true`). Los usuarios demo son efímeros por contrato (TTL de 7 días, ya limpiados por un job); darles copia propia y repuntar solo sus transacciones habría duplicado la superficie de backfill para preservar datos desechables por diseño.

**FK compuesta en Prisma 7:** el gate de D-06 pasó con la relación multi-campo tal como se especificó (sin relación `user` en `PatronClasificacion`, sin `User.patrones`). No se tomó el fallback de FK simple.

---

## Preguntas quedaron abiertas y precondiciones vinculantes para US-038

Dos precondiciones binding registradas en `design.md` y en el spec (`CAT037-02`), que **cualquier implementación de US-038 (CRUD de catálogo por usuario) debe respetar**:

1. **El catálogo de los usuarios demo es de solo lectura (decisión de producto, 2026-08-11).** Un usuario demo recibe la copia completa de la plantilla solo para fines de clasificación y NO debe poder modificar sus categorías ni patrones. Este cambio no introduce ningún endpoint de mutación de catálogo, así que no hay nada que aplicar en runtime hoy; la restricción vincula a **US-038**: todo endpoint de mutación de catálogo que introduzca debe verificar sesiones `esDemo` y rechazar la mutación con indicación de registrar una cuenta (misma familia de UX que el prompt de upgrade-de-demo ya existente).
2. **El desempate `(prioridad, patron, id)` de D-08 es estructural para el determinismo cross-usuario.** Los patrones definidos por el usuario que introduzca US-038 deben mantener un orden total e independiente del usuario — no reintroducir un desempate que dependa solo del id surrogate.

La rama de fallback de D-06 (FK simple) **no se tomó**, así que no aplica ninguna precondición derivada de esa rama a US-038.

## Alternativas consideradas

- **Filas de plantilla propiedad de un tenant de sistema** — diferida, con disparador explícito de revisión: US-038 (CRUD por usuario) o un requisito real de "sincronizar categorías sugeridas". En ese punto, promover la plantilla a filas se vuelve una migración deliberada y aislada, no una especulativa ahora.
- **Un solo escritor de plantilla con flag `ids?`** — rechazada (D-07): mezcla dos estrategias de escritura (upsert idempotente por id fijo vs. insert con ids generados) en una función con demasiados parámetros condicionales.
- **FK compuesta agregada por SQL crudo mientras el schema de Prisma mantiene una relación simple** — rechazada: a diferencia del precedente de `CHECK` (`add_cargo_abono_check`), las foreign keys **sí** son parte del modelo de Prisma, así que el constraint extra sería drift — el siguiente `prisma migrate dev` generaría una migración no solicitada para eliminarlo.
- **Derivar ids de patrones copiados de forma determinista (`${userId}:${templateKey}`)** — rechazada (D-08): habría preservado el desempate actual e incluso hecho la copia idempotente, pero vuelve a codificar comportamiento de negocio en una clave surrogate — exactamente el problema que se está corrigiendo — y mete un `userId` dentro de una primary key.
- **Eliminar `prisma/backfill-categorias.ts`** — rechazada (D-10): más limpio en abstracto, pero borrar un script más sus specs unitarias e de integración es una limpieza separada que este cambio no propuso. Acotar es el fix de mínimo riesgo dentro del alcance; la eliminación queda registrada como trabajo futuro.

## Consecuencias

- **Aislamiento multi-tenant real en el catálogo** (RNF-SEC-006 cerrado para `Categoria`/`PatronClasificacion`): cada usuario clasifica solo contra sus propios patrones, y ninguna lectura de categoría puede filtrarse entre usuarios.
- **Cierra el riesgo silencioso más alto identificado en la propuesta**: el fold-to-null de categorías para todo usuario no-seed en movimientos/detalle-bucket (D-09), verificado con un test de regresión explícito de "segundo usuario ve categorías reales".
- **`Transaccion` sigue sin `userId` propio** (su aislamiento sigue siendo vía `Account`); la FK compuesta cierra el catálogo, no el lado de `Transaccion.categoriaId` — riesgo residual aceptado y cubierto por el test de integración de aislamiento (`catalogo-isolation.int-spec.ts`), no por el esquema.
- **Migración y código son una sola unidad desplegable.** Un rollback solo-código con el esquema ya aplicado resuelve mal a cada usuario no-seed; un despliegue solo-esquema deja categorías en blanco en todas partes. El runbook de prod exige snapshot de Supabase inmediatamente antes.
- **Verificación adversarial (judgment-day):** PR #296 (schema + migración + gate de FK) aprobado en 4 rondas — migración/schema limpios, el harness de ensayo se endureció a 3 escenarios (incluyendo base de datos nueva). PR #301 (aislamiento + tests de regresión + acotamiento del backfill) aprobado en 2 rondas — la ronda demostró el secuestro cross-tenant de prioridad de patrones cerrado en D-10 arriba.
- **`foldCategoriaId` desaparece del código, no solo de los call sites en runtime** — cualquier PR futuro que intente reintroducir resolución por id físico rompe la compilación, no solo el comportamiento.
- **`domain/` casi no cambia**: el enum `Categoria`, `CATEGORIA_BUCKET`, la VO `PatronClasificacion` (`coincide()`), `Bucket`, la regla de Ingreso y la aritmética 50/30/20 quedan intactos; US-038 es dueño de cualquier cambio ahí.
- **Sin cambio de frontend**: `pnpm web test` se mantuvo verde con cero ediciones en `apps/web` — prueba de que los nombres de categoría se preservaron por construcción.

### Pendiente antes de producción

La tarea **6.9** (tercer ensayo de migración, contra un snapshot restaurado de prod, inmediatamente antes del deploy real) es un **gate manual, no automatizado en CI**, y **no se ejecutó** en este batch. El branch tracker `feat/us-037-catalogo-per-user` **no debe mergearse a `main`** hasta que ese ensayo pase y quede registrado en las notas de deploy — es la última verificación de que el guard de la migración (aborta si hay más de un usuario real) y el backfill se comportan igual contra datos reales que contra el Postgres efímero local.
