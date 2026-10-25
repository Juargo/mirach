---
tipo: adr
proyecto: Mirach
estado: Aceptado
fecha: 2026-10-24
requisitos: [RNF-SEC-002, RNF-SEC-003, RNF-FIA-002, RNF-EXA-001, RNF-PRV-005, IMP-05, IMP-18, IMP-19, IMP-22, AUTH-03, AUTH-05, CLA-08, CLA-10, CLA-12, PER-03, PER-08, PRI-02]
---

# ADR-004 — Persistencia: PostgreSQL relacional con transacciones ACID

## Estado

Aceptado (2026-10-25); propuesto el 2026-10-24. Motor, ORM, modelo multiusuario, tipos de dinero y cifrado ya
están en producción (**vigente**). Las tablas para perfiles, consentimientos, suscripción
y eventos son **nuevas**.

## Contexto

- Los datos son fuertemente relacionales: usuario → cuenta bancaria → ingesta → movimiento
  → categoría → bloque, con un catálogo de categorías y patrones propio de cada usuario.
- Varias reglas de negocio son reglas de integridad: no duplicar movimientos (IMP-05), un
  nombre de categoría no se repite dentro de un bloque (CLA-10), una categoría solo puede
  pertenecer a su usuario.
- Varias operaciones deben ser todo o nada: confirmar una ingesta (IMP-19), borrar una
  ingesta con sus movimientos (IMP-22), borrar la cuenta (AUTH-05).
- El resumen 50/30/20 suma montos agrupados por mes, bloque y categoría.
- RNF-EXA-001 prohíbe decimales flotantes para el dinero.

## Decisión

### 1. Motor y acceso (vigente)

- **PostgreSQL 17** gestionado por Supabase (ADR-002). El CI usa hoy `postgres:16-alpine`; se alinea a la versión 17 para probar contra el mismo motor que producción. Solo se usa la base de datos de
  Supabase, no su Auth, Storage ni Data API.
- **Prisma 7** con el adaptador `pg` como ORM y herramienta de migraciones. Consultas
  agregadas complejas pueden usar SQL parametrizado (`$queryRaw` con plantillas), nunca SQL
  concatenado.
- Los repositorios son adaptadores de `infrastructure/persistence` que implementan puertos
  de `application`; el dominio no conoce Prisma.

### 2. Propiedades ACID y dónde se usan

| Operación | Garantía | Requisito |
|-----------|----------|-----------|
| Confirmar una ingesta: crear la ingesta, sus movimientos y su clasificación | Una transacción; si algo falla, no queda nada guardado | IMP-19, IMP-18, RNF-FIA-002 |
| Borrar una ingesta y sus movimientos | Una transacción; los movimientos manuales no se tocan | IMP-22 |
| Crear la cuenta en el primer inicio de sesión, con su catálogo copiado de la plantilla y el registro de aceptación de términos | Una transacción | AUTH-03, CLA-08 |
| Borrar la cuenta y todos sus datos | Una transacción, cada sentencia filtrada por `userId` | AUTH-05 |
| Guardar un patrón y mover los movimientos coincidentes del mes | Una transacción | CLA-15 |

- Nivel de aislamiento: `READ COMMITTED` (el de PostgreSQL). Las carreras se resuelven con
  restricciones de unicidad, no con lecturas previas: si dos peticiones crean lo mismo, la
  segunda recibe una violación de unicidad (`P2002`) y el caso de uso la traduce o
  reintenta una vez.
- Durabilidad: la de PostgreSQL más los respaldos de ADR-002.

### 3. Modelo multiusuario (vigente)

Esquema compartido con `userId` en cada fila raíz (`Account`, `Ingesta`, `Categoria`,
`PatronClasificacion`, `Session`). El aislamiento se aplica en la consulta: todo repositorio
recibe el `userId` de la sesión y lo incluye en el `where` (RNF-SEC-002). Una FK compuesta
`(categoriaId, userId)` impide que un movimiento apunte a la categoría de otro usuario.

### 4. Dinero y porcentajes (vigente)

- Montos en **pesos enteros con `BigInt`**, en dos columnas no negativas: `cargo` y `abono`.
  Nunca `float` ni `Decimal` con fracción.
- Porcentajes y metas en **puntos base enteros** (5.000 = 50 %).
- Una sola regla de redondeo, en el dominio y probada (ADR-010).

### 5. Unicidad e índices (vigente)

| Regla | Cómo se garantiza |
|-------|-------------------|
| Un movimiento no se repite (IMP-05) | Clave de duplicado en el dominio (`clave-duplicado.ts`): cuenta, fecha, descripción, cargo y abono. **Brecha:** dos compras idénticas el mismo día se tratan como duplicado y la segunda se pierde. Decisión del product owner (2026-10-24): antes del lanzamiento la clave suma el saldo (si el archivo lo trae) y el orden dentro del archivo, como propone IMP-05 |
| Categoría única por bloque (CLA-10) | Índice único `(userId, bucketId, nombre)` |
| Una identidad de proveedor, una cuenta | `googleSub` y `appleSub` únicos |
| Email único sin guardarlo en claro | Índice ciego `emailBlindIndex` único (HMAC, ADR-009) |
| Consultas del mes | Índice `(accountId, fecha)` |

### 6. Cifrado (vigente, detalle en ADR-009)

Cifrado en reposo de toda la base (Supabase) más cifrado AES-256-GCM a nivel de aplicación
en `descripcion`, `numeroCuenta`, `email` y `appleRefreshToken`. Monto, fecha, bloque y
categoría quedan solo con el cifrado en reposo para poder sumarlos y agruparlos en SQL
(RNF-SEC-003).

### 7. Migraciones

- Prisma Migrate; cada migración se versiona en `apps/api/prisma/migrations`.
- Patrón **expandir y contraer**: una migración que agrega columnas o tablas se aplica antes
  del código que las usa; una que elimina, después del deploy que deja de usarlas. Así el
  código anterior y el nuevo funcionan con el mismo esquema y un rollback del API es seguro.
- Hoy se aplican a mano. Con el plan pagado de Render, las migraciones de expansión corren
  en el comando previo al deploy (ADR-002); las de contracción siguen siendo un paso
  explícito.
- Un guardia (`db-safety`) impide correr pruebas destructivas contra una URL de producción.

### 8. Tablas nuevas para la v1 (nuevo)

| Tabla o campo | Para qué | Requisitos |
|---------------|----------|------------|
| Perfil de presupuesto del usuario: tipo (predefinido o personalizado) y tres metas en puntos base que suman 10.000 | Perfiles 50/30/20, 60/20/20, 70/15/15, 80/10/10 y personalizado | PER-03 a PER-06 |
| Día de corte del mes financiero (1 a 28, por defecto 1) e ingreso mensual declarado | Mes financiero y base de los porcentajes | PER-02, PER-08, regla 1 |
| `Consentimiento`: tipo, versión, fecha de aceptación y de revocación | Términos, privacidad y procesamiento de cartolas | AUTH-03, PRI-02, PRI-06 |
| `Suscripcion`: plan, estado, vencimiento, tienda, último evento procesado | Derechos por plan | PLA, ADR-012 |
| `EventoProducto`: nombre, fecha, propiedades sin montos ni texto libre | KPIs | ADR-011 |
| `AccesoSoporte`: quién, cuándo, a qué cuenta y por qué | Registrar cada acceso de soporte | ADM-02 |

Los totales del mes **no** se guardan: se calculan al momento (ADR-003).

### 9. Retención

- El archivo de la cartola **nunca se escribe en disco ni en la base**: se lee en memoria y
  se descarta al terminar la petición (RNF-PRV-005 se cumple por construcción).
- Al borrar la cuenta, los datos se eliminan en el momento. Las copias de respaldo de
  Supabase los conservan hasta que rotan (7 días en el plan Pro); la política de privacidad
  debe declarar ese plazo.

### 10. Sin base no relacional ni vectorial

- **No relacional:** no hay datos sin esquema ni volumen que lo justifique. Si aparece un
  dato semiestructurado, se usa una columna `jsonb` en la misma PostgreSQL.
- **Vectorial:** la clasificación es determinista por patrones de texto, con desempate
  estable (CLA-12, CLA-14) y visible para el usuario (CLA-07). No hay búsqueda semántica ni
  modelos sobre los movimientos, y la promesa de privacidad depende de eso. Si en el futuro
  se usa un modelo, sería `pgvector` en la misma base, con un ADR nuevo y la política de
  privacidad reescrita antes.

## Alternativas consideradas

| Alternativa | Por qué no |
|-------------|------------|
| MongoDB u otra documental | Perdería integridad referencial, unicidad compuesta y transacciones simples entre colecciones, que son reglas de negocio aquí. |
| SQLite en el dispositivo como fuente de verdad | Dos apps con su propia base y su propio cálculo rompen RNF-EXA-002; además los requisitos piden cuenta y datos en el servidor. |
| Row Level Security de Supabase como mecanismo de aislamiento | El API se conecta con un rol propio, no con la identidad del usuario. El aislamiento se aplica en los repositorios y se prueba endpoint por endpoint. Ver ADR-009 sobre desactivar la Data API. |
| `pgsodium` o cifrado transparente de columnas | En deprecación en Supabase y acopla el cifrado al motor. |
| Guardar el archivo para reprocesarlo (IMP-17) | Choca con RNF-PRV-005 e IMP-07. Se descarta en la v1: corregir datos de una cartola es borrar la ingesta y volver a subirla (IMP-22). |

## Consecuencias

- Las reglas de integridad viven en la base y no dependen de que el código las recuerde.
- Los campos cifrados no se pueden buscar con SQL. La búsqueda por texto (MOV-06) debe
  descifrar en el API los movimientos del rango consultado; con el volumen de un usuario es
  aceptable.
- Cada tabla nueva lleva `userId` y su test de aislamiento.

## Referencias

- ADR-002 Topología
- ADR-009 Seguridad
- ADR-011 Observabilidad
- `apps/api/prisma/schema.prisma`
- Serie anterior: ADR-002, ADR-013, ADR-036, ADR-037, ADR-039, ADR-042
