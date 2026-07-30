---
tags:
  - adr
  - fase-diseño
  - seguridad
  - base-de-datos
proyecto: MoneyDiary
estado: ✅ Decidido
fecha_creacion: 2026-07-05
fecha_actualizacion: 2026-07-05
---

# ADR-013 — Cifrado de Datos en Reposo

## Estado

✅ **Decidido**

Satisface el requisito no funcional RNF-SEC-007 ("todos los datos registrados deben almacenarse cifrados en la Base de datos").

---

## Contexto

MoneyDiary almacena información financiera personal: transacciones bancarias, montos, descripciones de movimientos, comercios y, potencialmente, datos identificatorios del titular (nombre, RUT) extraídos de las cartolas. Aunque el producto NO pide claves bancarias ni acceso al correo (ver RES-ALC-005, RNF-PRV-001), los datos que sí guarda son sensibles y su exposición dañaría directamente la propuesta de valor basada en **privacidad y confianza** (RN-DIF-003/004).

El stakeholder definió (2026-07-05) que **todos los datos registrados deben quedar cifrados en la Base de datos**. La base de datos es PostgreSQL gestionado por Supabase (ADR-002 Base de Datos), con Prisma como ORM. El backend sigue Clean Architecture (ADR-005 Monolito-Modular-Clean-Architecture): el cifrado es una preocupación de **infraestructura**, no del dominio.

### Tensión de diseño

El cifrado a nivel de columna es incompatible con operar sobre esos campos en SQL: un valor cifrado no se puede indexar, filtrar por rango, ordenar ni agregar. MoneyDiary calcula el semáforo 50/30/20 sumando montos y agrupando por mes, bucket y comercio (RF-VIS-001/008). Cifrar los campos usados en esas agregaciones obligaría a traer todas las filas a memoria y calcular en la aplicación, sacrificando rendimiento y complejidad. Por tanto la decisión debe distinguir **qué se cifra a nivel de columna y qué queda solo bajo cifrado en reposo**.

---

## Opciones Evaluadas

### Opción A — Solo cifrado en reposo nativo de Supabase

Supabase cifra el disco de la Base de datos de forma transparente (AES). No requiere cambios de código y no afecta consultas.

✅ Cero impacto en desarrollo y en consultas 50/30/20
✅ Cubre el escenario de robo físico del disco / backups
❌ Los datos quedan **en claro para cualquiera con acceso lógico a la BD** (una credencial filtrada, un `SELECT` de un tercero con acceso, un dump)
❌ No satisface plenamente la intención del stakeholder de que "los datos registrados estén cifrados"

### Opción B — Transparent Column Encryption (TCE) con pgsodium / Supabase Vault para columnas

Cifrado a nivel de columna dentro de PostgreSQL usando `pgsodium`.

❌ **`pgsodium` y TCE están en proceso de deprecación** y Supabase **no los recomienda** por su alta complejidad operativa y riesgo de mala configuración (julio 2026).
❌ Acopla el cifrado al motor de BD, contradiciendo la regla de que la infraestructura sea sustituible.
⚠️ Supabase Vault sigue siendo el mecanismo recomendado, pero su propósito es **almacenar secretos**, no cifrar de forma transparente todas las columnas de negocio.

### Opción C — Cifrado en reposo (todo) + cifrado a nivel de aplicación en columnas sensibles ✅ (elegida)

Dos capas complementarias:

1. **Cifrado en reposo de toda la Base de datos**: se confía en el cifrado nativo de Supabase (transparente). Cubre disco y backups sin afectar consultas.
2. **Cifrado a nivel de aplicación** para las columnas con datos personales/sensibles que **no se consultan por SQL**: el backend (capa de infraestructura) cifra el valor antes de persistirlo con Prisma y lo descifra al leerlo. La clave se gestiona **fuera de la Base de datos** (variable de entorno / gestor de secretos), de modo que un acceso a la BD por sí solo no revela el dato.

✅ Cumple RNF-SEC-007 con defensa en profundidad (un dump de la BD no expone los campos sensibles)
✅ Preserva las agregaciones 50/30/20: montos, fechas y bucket quedan consultables
✅ El cifrado vive en infraestructura (idiomático con Clean Architecture); la BD sigue siendo sustituible
✅ No depende de extensiones deprecadas
✅ La clave nunca vive junto a los datos (separación de secreto y dato cifrado)
❌ Requiere código de cifrado/descifrado y una **estrategia de gestión y rotación de claves** (ver Consecuencias)
❌ Los campos cifrados no son buscables (aceptable: son descriptivos, no de agregación)

---

## Decisión

**Estrategia de dos capas (Opción C):**

1. **Cifrado en reposo de toda la Base de datos** mediante el cifrado nativo de Supabase/PostgreSQL (transparente).
2. **Cifrado a nivel de aplicación (AES-256-GCM)** en columnas de datos personales/sensibles que no participan en consultas SQL. Claves gestionadas fuera de la BD (variable de entorno en el MVP; gestor de secretos en producción). **No** se usa `pgsodium`/TCE.

### Clasificación de campos

| Campo | Trato | Motivo |
|-------|-------|--------|
| Descripción / glosa de la transacción | Cifrado a nivel de aplicación | Dato sensible, descriptivo, no se consulta por SQL |
| Nombre del titular, RUT | Cifrado a nivel de aplicación | Dato identificatorio personal |
| Detalle de ítems de una compra | Cifrado a nivel de aplicación | Sensible, descriptivo |
| Monto | Solo cifrado en reposo | Se agrega para el cálculo 50/30/20 (RF-VIS-001) |
| Fecha | Solo cifrado en reposo | Se filtra/agrupa por mes |
| Bucket / categoría / comercio (id) | Solo cifrado en reposo | Se agrupan y cuentan |

> El comercio se referencia por identificador contra el catálogo, no como texto libre; por eso queda consultable sin exponer datos personales.

### Ubicación en la arquitectura

El cifrado se implementa como un **servicio de infraestructura** (p. ej. `CryptoService` en `apps/api/src/infrastructure/`), invocado por los adaptadores de persistencia. El dominio y la aplicación permanecen ajenos al cifrado, manipulando siempre valores en claro (coherente con ADR-005 Monolito-Modular-Clean-Architecture).

---

## Consecuencias

**Positivas:**
- Defensa en profundidad: un volcado de la BD no revela los datos personales sin la clave, que vive fuera de la BD.
- Se preserva el rendimiento de las consultas 50/30/20 (los campos agregables no se cifran a nivel de columna).
- No se introduce dependencia de extensiones deprecadas (`pgsodium`/TCE).
- El cifrado queda encapsulado en infraestructura y es testeable de forma aislada.

**A tener en cuenta:**
- **Gestión de claves:** definir dónde vive la clave maestra (env en MVP; gestor de secretos como el propio Supabase Vault, Doppler o el secret manager del hosting en producción) y un procedimiento de **rotación**. La clave NUNCA se commitea al repositorio (RNF-SEC-005).
- **Pérdida de clave = pérdida de datos** de los campos cifrados: incluir la clave en la estrategia de respaldo.
- **Migración de datos existentes:** si ya hay filas persistidas en claro, requerirá un script de migración que las cifre.
- **Búsqueda sobre campos cifrados:** si en el futuro se necesita buscar por descripción, evaluar *blind indexing* (HMAC determinista en columna aparte) en un ADR posterior.
- **Multi-usuario:** cuando exista (RF-AUT-002), decidir si la clave es global o derivada por usuario; se complementa con el aislamiento por `user_id` (RNF-SEC-006).

---

## Referencias

- [Vault | Supabase Docs](https://supabase.com/docs/guides/database/vault)
- [pgsodium (pending deprecation): Encryption Features | Supabase Docs](https://supabase.com/docs/guides/database/extensions/pgsodium)
- [pgsodium / TCE not recommended and deprecated · Supabase Discussion #27109](https://github.com/orgs/supabase/discussions/27109)
- ADR-002 Base de Datos
- ADR-005 Monolito-Modular-Clean-Architecture
- Requisito no Funcional — RNF-SEC-007
- De Datos o Integraciones — RD-ENT-002

---

*Fecha de decisión: 2026-07-05 · Última actualización: 2026-07-05*
