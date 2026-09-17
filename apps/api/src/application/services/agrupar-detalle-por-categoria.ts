import { DetalleBucketRow } from '../ports/detalle-bucket.port';

/**
 * TransaccionDetalleBucketMes — proyección de transacción del detalle
 * MES-BUCKET en el borde de la aplicación (US-051).
 *
 * Gate PR1 (MBD-08/ADR-015): {id, fecha, descripcion, monto} — la PII de
 * CUENTA (tipoCuenta/numeroCuenta) se recorta AQUÍ, en el límite
 * application/infrastructure, no en el DTO: cualquier caller del use case
 * nunca puede verla. `monto` = cargo del row (el DTO lo serializa como
 * String — D-06). `origen` se SUMA en PR2 (correccion-movimientos-manuales,
 * design D-02): `banco` deja de recortarse y pasa como la señal
 * `esManual`/nombre-de-banco que WEB-DEL-01 necesita para el control de
 * borrado en la vista de gasto.
 */
export interface TransaccionDetalleBucketMes {
  readonly id: string;
  readonly fecha: Date;
  readonly descripcion: string;
  /** Nombre de banco verbatim, o `'Manual'` (D-02). Mirror EXACTO de
   *  `TransaccionIngresoMes.origen` (`obtener-ingresos-mes.use-case.ts`) —
   *  2ª ocurrencia de `fila.banco || 'Manual'`; anotado por DRY (regla de
   *  los 3 strikes), no extraído todavía. */
  readonly origen: string;
  /** Monto = cargo del row. El allowlist del use case excluye Ingreso, así
   *  que nunca hay abono aquí (D-08). BigInt hasta el DTO (CA-05). */
  readonly monto: bigint;
}

/**
 * GrupoDetalleCategoria — grupo de transacciones del detalle MES-BUCKET
 * (US-051) con el subtotal en BigInt (la serialización a string ocurre solo
 * en el DTO HTTP — D-06).
 */
export interface GrupoDetalleCategoria {
  /** null solo para el grupo sintético "Sin categoría". */
  readonly categoriaId: string | null;
  readonly nombre: string;
  /** El icono curado de la categoría, o `null` cuando no tiene uno propio Y
   *  SIEMPRE `null` para el grupo sintético "Sin categoría" (MBD-02,
   *  categoria-iconografia) — ambos casos comparten `categoria === null`
   *  en las filas de entrada, así que no hace falta una rama especial. */
  readonly icono: string | null;
  readonly subtotal: bigint;
  readonly conteo: number;
  /** Proyección recortada sin PII (MBD-08); orden del reader preservado
   *  (monto desc, fecha asc, id asc desde 2026-09-17) — este servicio NO
   *  re-ordena las filas: el orden de las transacciones lo decide el
   *  `orderBy` del reader, en SQL, y el de los grupos este servicio, porque
   *  el subtotal por el que se ordenan solo existe después de agrupar. */
  readonly transacciones: ReadonlyArray<TransaccionDetalleBucketMes>;
}

interface GrupoAcumulador {
  readonly categoriaId: string | null;
  readonly nombre: string;
  readonly icono: string | null;
  subtotal: bigint;
  readonly transacciones: TransaccionDetalleBucketMes[];
}

const NOMBRE_SIN_CATEGORIA = 'Sin categoría';
const CLAVE_SIN_CATEGORIA = 'sin-categoria';

/**
 * Orden por SUBTOTAL descendente — el grupo que más gastó primero — con
 * "Sin categoría" SIEMPRE al final y el nombre es-CL como desempate.
 *
 * Era orden alfabético hasta 2026-09-17. Un libro mayor alfabético obliga a
 * leerlo entero para encontrar dónde se fue la plata; ordenado por monto, la
 * respuesta es la primera fila.
 *
 * Tres reglas, en este orden:
 *
 * 1. "Sin categoría" al final, se conserva intacta. Es el resto por
 *    clasificar, no una categoría del presupuesto, y mezclarlo por monto lo
 *    pondría arriba justo en los meses en que hay mucho sin clasificar —
 *    tapando las categorías reales con un grupo que no es una decisión de
 *    gasto.
 * 2. Subtotal descendente. La comparación es EXPLÍCITA con `>`/`<` y NUNCA
 *    `Number(a - b)`: `subtotal` es `bigint`, y `Array.prototype.sort` exige
 *    un `number`. Restar y castear es el camino corto a perder precisión en
 *    montos grandes (ADR-015: dinero con tipos exactos, nunca float).
 * 3. Nombre es-CL como desempate, para que dos categorías con el mismo gasto
 *    salgan siempre en el mismo orden y la lista no baile entre requests. El
 *    locale es EXPLÍCITO porque los nombres creados por el usuario llevan
 *    tildes y ñ, y la colación por defecto depende del ICU del runtime.
 */
function compararGrupos(a: GrupoAcumulador, b: GrupoAcumulador): number {
  if (a.nombre === NOMBRE_SIN_CATEGORIA) {
    return b.nombre === NOMBRE_SIN_CATEGORIA ? 0 : 1;
  }
  if (b.nombre === NOMBRE_SIN_CATEGORIA) return -1;
  if (a.subtotal > b.subtotal) return -1;
  if (a.subtotal < b.subtotal) return 1;
  return a.nombre.localeCompare(b.nombre, 'es-CL');
}

/** Proyección recortada (MBD-08): solo la forma que el cliente necesita. */
function recortarTransaccion(
  fila: DetalleBucketRow,
): TransaccionDetalleBucketMes {
  return {
    id: fila.id,
    fecha: fila.fecha,
    descripcion: fila.descripcion,
    // El `||` compila sobre `banco: string` no-nullable y es runtime-safe:
    // una fila hipotética con banco vacío cae a la rama Manual (D-02, 2ª
    // ocurrencia — ver `obtener-ingresos-mes.use-case.ts`).
    origen: fila.banco || 'Manual',
    monto: fila.cargo,
  };
}

/**
 * agruparDetallePorCategoria — servicio puro que agrupa las transacciones de
 * UN bucket (ya validadas por el use case, D-08) por `categoriaId` (D-03).
 *
 * Reglas (nacieron espejando un helper web homónimo que YA NO EXISTE —
 * verificado 2026-09-17: no queda ningún `agrupar-detalle-por-categoria` bajo
 * `apps/web/src`, así que este archivo es hoy la ÚNICA fuente del orden, para
 * web y para mobile):
 * - clave de grupo: `categoriaId` (filas con `categoria: null` → grupo
 *   sintético "Sin categoría" con `categoriaId: null`);
 * - subtotal = Σ `cargo` en BigInt (el allowlist del use case excluye
 *   Ingreso, así que no hay rama defensiva abono — D-03);
 * - grupos ordenados por `subtotal` DESCENDENTE, "Sin categoría" siempre al
 *   final, nombre es-CL como desempate (ver `compararGrupos`);
 * - solo categorías presentes (nunca grupos vacíos); input vacío → `[]`;
 * - las `transacciones` de cada grupo preservan el orden del reader y son la
 *   proyección recortada sin PII (MBD-08).
 *
 * Pura: sin I/O, sin excepciones, sin math float (ADR-015).
 */
export function agruparDetallePorCategoria(
  filas: ReadonlyArray<DetalleBucketRow>,
): ReadonlyArray<GrupoDetalleCategoria> {
  const grupos = new Map<string, GrupoAcumulador>();

  for (const fila of filas) {
    const clave = fila.categoria?.id ?? CLAVE_SIN_CATEGORIA;
    const existente = grupos.get(clave);
    if (existente) {
      existente.subtotal += fila.cargo;
      existente.transacciones.push(recortarTransaccion(fila));
      continue;
    }
    grupos.set(clave, {
      categoriaId: fila.categoria?.id ?? null,
      nombre: fila.categoria?.nombre ?? NOMBRE_SIN_CATEGORIA,
      // `fila.categoria` es `null` tanto para el grupo sintético "Sin
      // categoría" como para cualquier fila sin categoría asignada — en
      // ambos casos `?? null` ya produce el `null` que MBD-02 exige.
      icono: fila.categoria?.icono ?? null,
      subtotal: fila.cargo,
      transacciones: [recortarTransaccion(fila)],
    });
  }

  return Array.from(grupos.values())
    .sort(compararGrupos)
    .map((grupo) => ({
      categoriaId: grupo.categoriaId,
      nombre: grupo.nombre,
      icono: grupo.icono,
      subtotal: grupo.subtotal,
      conteo: grupo.transacciones.length,
      transacciones: grupo.transacciones,
    }));
}
