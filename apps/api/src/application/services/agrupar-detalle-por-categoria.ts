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
  readonly subtotal: bigint;
  readonly conteo: number;
  /** Proyección recortada sin PII (MBD-08); orden del reader preservado
   *  (fecha asc, id asc) — no se re-ordena. */
  readonly transacciones: ReadonlyArray<TransaccionDetalleBucketMes>;
}

interface GrupoAcumulador {
  readonly categoriaId: string | null;
  readonly nombre: string;
  subtotal: bigint;
  readonly transacciones: TransaccionDetalleBucketMes[];
}

const NOMBRE_SIN_CATEGORIA = 'Sin categoría';
const CLAVE_SIN_CATEGORIA = 'sin-categoria';

/**
 * Orden alfabético es-CL, con "Sin categoría" SIEMPRE al final. Espeja el
 * helper web `agrupar-detalle-por-categoria.ts` (US-013 WCAT-02): el locale
 * es EXPLÍCITO porque los nombres creados por el usuario llevan tildes y ñ y
 * la colación por defecto depende del ICU del runtime.
 */
function compararGrupos(a: string, b: string): number {
  if (a === NOMBRE_SIN_CATEGORIA) return b === NOMBRE_SIN_CATEGORIA ? 0 : 1;
  if (b === NOMBRE_SIN_CATEGORIA) return -1;
  return a.localeCompare(b, 'es-CL');
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
 * Espeja las reglas documentadas del helper web `agrupar-detalle-por-categoria.ts`
 * (misma 3ª implementación de agrupación — deliberadamente SIN abstracción
 * cross-layer, ADR-005/008):
 * - clave de grupo: `categoriaId` (filas con `categoria: null` → grupo
 *   sintético "Sin categoría" con `categoriaId: null`);
 * - subtotal = Σ `cargo` en BigInt (el allowlist del use case excluye
 *   Ingreso, así que no hay rama defensiva abono — D-03);
 * - grupos ordenados por `nombre` es-CL, "Sin categoría" siempre al final;
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
      subtotal: fila.cargo,
      transacciones: [recortarTransaccion(fila)],
    });
  }

  return Array.from(grupos.values())
    .sort((a, b) => compararGrupos(a.nombre, b.nombre))
    .map((grupo) => ({
      categoriaId: grupo.categoriaId,
      nombre: grupo.nombre,
      subtotal: grupo.subtotal,
      conteo: grupo.transacciones.length,
      transacciones: grupo.transacciones,
    }));
}
