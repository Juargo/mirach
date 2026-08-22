---
tags:
  - adr
  - fase-diseño
  - movimientos
  - backend
proyecto: MoneyDiary
estado: ✅ Decidido
fecha_creacion: 2026-08-21
fecha_actualizacion: 2026-08-21
---

# ADR-039 — Movimientos manuales: columna `origen`, cuenta centinela y semántica de identidad de origen

## Estado

✅ **Decidido** (2026-08-21, PR4 de us-058-registro-manual, US-058).

> [!info] Relación con ADR-026
> Este ADR **enmienda ADR-026** en una premisa de dato: desde ADR-026 toda `Transaccion`
> nace de una `Ingesta` (carga de cartola). A partir de este ADR, una `Transaccion` puede
> también ser **manual** — registrada a mano por el usuario, sin cartola de respaldo, a
> través de `POST /api/movimientos` (US-058). La capacidad de ingesta de ADR-026 sigue
> **vigente sin cambios**; solo cambia el supuesto de que la única fuente de creación es
> la ingesta.
>
> Se sigue el mismo patrón de enmienda que ADR-038 → ADR-026 y ADR-026 → ADR-010: el
> ADR viejo **no se edita**; la relación se declara acá y el índice agrega la nota de
> enmienda.

---

## Contexto

ADR-026 habilitó la ingesta desde mobile y fijó que `POST /api/ingestas` es la única
superficie de escritura sobre transacciones. La arquitectura resultante asume que cada
`Transaccion` tiene un `ingestaId` no nulo y un `accountId` apuntando a una cuenta
detectada por parser bancario.

US-058 introduce un segundo origen: el usuario registra un movimiento sin cartola, a mano
("Ingreso: Reembolso de $45.000", "Gasto: Feria"). Este caso tiene tres consecuencias
estructurales verificables en el repo al momento del diseño:

1. **`Transaccion.ingestaId` debe poder ser `null`** — no existe `Ingesta` de respaldo
   para un movimiento manual. La columna estaba `NOT NULL` hasta esta migración.

2. **La identidad de origen debe ser durable en la BD** — no solo inferible por la
   presencia o ausencia de `ingestaId`. Un `ingestaId IS NULL` sin más contexto sería
   ambiguo en el futuro (podría ser un row de importación fallida, un eventual borrado de
   ingesta, o cualquier dato antiguo). La columna `origen String?` fija el significado en
   el dato mismo.

3. **El `accountId` sigue siendo `NOT NULL`** — la cadena `account:{userId}` es la llave
   de aislamiento multi-tenant en los 5 readers (resumen, detalle-bucket, movimientos-mes,
   ingresos-mes, resumen-anual). Cualquier diseño que dejase `accountId` nulo en las
   transacciones manuales habría requerido modificar los 5 readers (blast radius alto).

El diseño evalúa tres enfoques y elige el **enfoque C** (columna `origen` + cuenta
centinela por usuario):

| Enfoque | Descripción | Estado |
|---------|-------------|--------|
| A | `accountId` nullable para manuales | Rechazado — modifica los 5 readers |
| B | Cuenta centinela global compartida (sin `origen`) | Rechazado — rompe el aislamiento `userId` |
| **C** | Columna `origen String?` + cuenta centinela **por usuario** | **Elegido** |

---

## Decisión

**Enfoque C: columna `origen String?` con semántica C-a, cuenta centinela per-user
`Account(banco='Manual')`, y CHECK de paridad en la BD.**

### C-a — semántica de la columna `origen`

`null` = row nacido de una ingesta (comportamiento histórico de todo row existente).
`'Manual'` = row registrado a mano por el usuario (US-058 en adelante).

Este convenio es **C-a** (columna nullable, sin backfill). La alternativa C-b (NOT NULL
con backfill `'Ingesta'` en todos los rows existentes) fue descartada: la tabla
`Transaccion` es la más grande del schema, y backfillear cada row existente para un
cambio de semántica que tiene `null` como estado natural es trabajo sin valor de producto.
Además, el patrón de columna aditiva nullable sin backfill ya existe en este repo
(`duplicadosOmitidos`, `schema.prisma:107-111`, `@default(0)` — un valor de negocio, no un
`null`, pero el patrón de "nueva columna sin tocar rows viejos" es el mismo).

### Invariante de paridad `origen`/`ingestaId`

```sql
-- Pairing invariant: (ingestaId IS NULL) ⟺ (origen IS NOT DISTINCT FROM 'Manual')
-- Forma null-safe requerida: la forma naïve (origen = 'Manual') pasaría
-- silenciosamente (ingestaId=NULL, origen=NULL) porque NULL = 'Manual' evalúa
-- a NULL en Postgres, y un resultado NULL en un CHECK se trata como PASS.
ALTER TABLE "Transaccion" ADD CONSTRAINT "Transaccion_origen_ingesta_consistency"
  CHECK (("ingestaId" IS NULL) = ("origen" IS NOT DISTINCT FROM 'Manual'));
```

Tabla de verdad del CHECK (forma `IS NOT DISTINCT FROM`):

| `ingestaId` | `origen` | LHS | RHS | Resultado CHECK |
|-------------|----------|-----|-----|-----------------|
| `NULL` | `NULL` | TRUE | FALSE | **REJECTED** ✗ |
| `NULL` | `'Manual'` | TRUE | TRUE | PASSES ✓ |
| `'abc...'` | `NULL` | FALSE | FALSE | PASSES ✓ |
| `'abc...'` | `'Manual'` | FALSE | TRUE | **REJECTED** ✗ |

La forma naïve `(ingestaId IS NULL) = (origen = 'Manual')` habría pasado la fila 1
(bug silencioso en producción). La forma null-safe `IS NOT DISTINCT FROM` la rechaza
correctamente. El mismo patrón de CHECK raw ya existe en el repo:
`Transaccion_cargo_abono_no_negativos` (migración `20260710185710`) e
`Ingesta_procesada_requires_account` (migración `20260801000000:54-55`).

### Cuenta centinela per-user

El endpoint `POST /api/movimientos` escribe en la tabla `Transaccion` con `accountId` no
nulo apuntando a una fila de `Account` con `banco='Manual'`, propia del usuario que
registra. Esta cuenta centinela:

- Se crea con un **upsert idempotente** sobre la clave compuesta natural
  `@@unique([userId, banco, tipoCuenta, numeroCuentaBlindIndex])` —  la misma clave que
  usan las cuentas detectadas por parser bancario.
- Usa valores centinela fijos: `banco='Manual'`, `tipoCuenta='Manual'`,
  `numeroCuenta` = `crypto.encrypt(normalizeNumeroCuenta('MANUAL'))`.
- El `numeroCuentaBlindIndex` **nunca es nulo** — un blind index nulo rompería la
  idempotencia del upsert bajo la semántica Postgres de NULL en columnas unique (dos NULL
  son distintos, no iguales, por lo que se crearía una nueva fila centinela en cada llamada).
- Es **por usuario** (`userId` en la clave compuesta) — la cuenta centinela de A nunca
  colisiona con la de B, y el filtro `account:{userId}` de los readers mantiene el
  aislamiento multi-tenant sin modificación (RNF-SEC-006).

Razón por la que **no** se reutiliza `IAccountRepository.ensure(userId, banco: DetectedBank)`:
el tipo `DetectedBank.banco` requiere un `BancoConocido` (enum de 4 valores:
`BancodeChile`, `BancoEstado`, `BCI`, `Santander`). `'Manual'` no pertenece a ese enum.
Ampliar el enum corrompería la semántica de detección bancaria (OCP + semántica errónea).
El adapter de movimiento manual tiene su propio método `asegurarCuentaManual(userId)` en
`IRegistrarMovimientoManualWriter` (ISP, port estrecho), que reutiliza el
`ICryptoService` y `IBlindIndexService` del composition root (DRY en el camino
encrypt/blind-index) sin ampliar ports ajenos.

### Inmunidad al borrado de ingesta (CA-04)

`PrismaEliminarIngestaRepository.eliminarConTransacciones` borra `Transaccion WHERE
{ ingestaId: <ingestaId>, ingesta: { userId, estado: PROCESADA } }`. Una fila manual
tiene `ingestaId = null`, por lo que `NULL = <algún cuid>` evalúa a `NULL` en SQL
(lógica de tres valores), nunca a `TRUE` — la fila **jamás entra en el WHERE** y
sobrevive al borrado de ingesta por construcción. Esta garantía es estructural (SQL) y
no depende de ningún comportamiento de Prisma.

### Derivación de `origen` para el reader US-052 (D-06, zero reader changes)

`ObtenerIngresosMesUseCase` ya derivaba `origen: fila.banco || 'Manual'` desde el campo
`row.account.banco`. Como la cuenta centinela tiene `banco='Manual'` (cadena truthy), el
operador `||` devuelve el operando izquierdo (`fila.banco`, cuyo valor es `'Manual'`) — no
el literal `'Manual'` del lado derecho, que solo se devolvería en la rama falsy. El
resultado es el mismo, pero la ruta es la truthy: sin necesidad de leer la nueva columna
`origen` en ningún reader. El reader no fue modificado (CA-05,
D-06, D-07). La columna `origen` es proveniencia durable en la BD y el trigger del
invariante de paridad, no la fuente de verdad para la UI en este sprint.

---

## Alternativas consideradas

### Enfoque A — `accountId` nullable para manuales

Los rows manuales tendrían `accountId = null`. El filtro `account:{userId}` en los 5
readers dejaría de funcionar sin modificación: los rows con `accountId IS NULL` no pasan
un JOIN sobre `account`.

✅ Sin cuenta centinela.
❌ **Modifica los 5 readers** — blast radius alto; rompe la propiedad "cero cambios en
readers" que CA-05 exige.
❌ Rompe RNF-SEC-006 (aislamiento por userId vía account join) en toda la capa de lectura.

### Enfoque B — Cuenta centinela global compartida (sin columna `origen`)

Una sola `Account(banco='Manual', userId=<userId-sistema>)` compartida por todos los
usuarios. Los rows manuales solo se distinguen por `ingestaId IS NULL`.

✅ Sin columna nueva.
❌ **Rompe el aislamiento multi-tenant**: el filtro `account:{userId}` excluiría los rows
manuales de todos los usuarios excepto el titular de la cuenta centinela global.
❌ Requiere modificar los 5 readers.
❌ La proveniencia `ingestaId IS NULL` es ambigua sin `origen`.

### Enfoque C-b — `origen NOT NULL` con backfill `'Ingesta'`

Idéntico al enfoque C elegido, pero `origen` sería NOT NULL y todos los rows existentes
recibirían `UPDATE SET origen = 'Ingesta'`.

✅ Semántica más explícita (sin null = ingesta).
❌ Backfill costoso sobre la tabla más grande del schema, sin ganancia de producto.
❌ El patrón C-a con `null` ingesta-born es unívoco dado que `ingestaId IS NOT NULL`
siempre acompaña a `origen IS NULL` (invariante del CHECK).

---

## Consecuencias

**Positivas:**
- **Cero cambios en los 5 readers** — CA-05, D-07: el row manual se clasifica en el
  bucket correcto por su `bucketId` y el filtro `account:{userId}` lo alcanza vía la
  cuenta centinela per-user.
- **Inmunidad al borrado de ingesta garantizada por SQL** — no por lógica de aplicación.
- **Proveniencia durable en la BD** — la columna `origen = 'Manual'` persiste el
  significado del row sin depender de la presencia o ausencia de `ingestaId`.
- **CHECK en la BD como defensa en profundidad** — un writer futuro que olvide setar
  `origen` recibirá un rechazo del motor, no una corrupción silenciosa.

**A tener en cuenta:**
- **Migraciones de rollback** — volver a `ingestaId NOT NULL` exige eliminar o aislar los
  rows manuales antes del `SET NOT NULL`; documentado en el `migration.sql` down step.
- **Evolución de `origen`** — si en el futuro se agregan más valores (ej: `'API'`,
  `'Import-preview'`), el CHECK deberá actualizarse. El diseño actual es mínimo
  intencionalmente (YAGNI).
- **La columna `origen` no es la fuente de la UI hoy** — en este sprint, la UI Origen de
  US-052 sigue usando `row.account.banco`. La columna `origen` es dato de BD y check
  constraint, no wire field. Si un reader futuro necesita exponer `origen` directamente,
  será trabajo separado.

---

## Migración (D-13)

```sql
-- US-058: movimientos manuales. Una Transaccion ya no nace solo de una Ingesta.

-- 1. Relajar ingestaId a nullable.
ALTER TABLE "Transaccion" ALTER COLUMN "ingestaId" DROP NOT NULL;

-- 2. Agregar origen (C-a): null = nacido de ingesta, 'Manual' = manual.
ALTER TABLE "Transaccion" ADD COLUMN "origen" TEXT;

-- 3. Invariante de paridad (raw SQL — Prisma no puede modelar CHECK).
ALTER TABLE "Transaccion" ADD CONSTRAINT "Transaccion_origen_ingesta_consistency"
  CHECK (("ingestaId" IS NULL) = ("origen" IS NOT DISTINCT FROM 'Manual'));
```

Cambios en `schema.prisma`: `ingestaId String?`; relación `ingesta Ingesta?
@relation(..., onDelete: Restrict)` (pin explícito para evitar drift a `SetNull`,
el default de Prisma para relaciones opcionales); `origen String?` con comentario de
semántica C-a.

---

## Referencias

- ADR-026 — Ingesta desde mobile: premisa de que toda `Transaccion` nace de una `Ingesta`
  (este ADR enmienda esa premisa)
- ADR-005 — Clean Architecture: la regla de dependencias `domain ← application ←
  infrastructure` y el port estrecho `IRegistrarMovimientoManualWriter`
- ADR-013 — Cifrado en reposo: `descripcion` y `numeroCuenta` de la cuenta centinela
  están cifrados; el blind index no es nulo (invariante de idempotencia del upsert)
- ADR-015 — Verificación por capas: la integración verifica las dos filas REJECTED por el
  CHECK, la inmunidad al borrado, y el aislamiento por `userId`
- ADR-036 / ADR-037 — Catálogo por usuario: la validación de `categoriaId` + `bucket` en
  la ruta Gasto reutiliza exactamente el mecanismo de US-057 (membership + bucket-match)
- US-052 — Columna Origen en readers: derivación via `row.account.banco || 'Manual'`,
  sin modificación en este sprint (D-06, D-07)
- US-058 — Historia que origina esta decisión

---

*Fecha de decisión: 2026-08-21 — decidido en PR4 de us-058-registro-manual.*
