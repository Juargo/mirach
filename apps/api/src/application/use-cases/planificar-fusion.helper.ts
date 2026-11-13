import { construirClaveDuplicado } from '../../domain/value-objects/clave-duplicado';
import { buscarPatronPorTexto } from '../../domain/value-objects/patron-existente';
import { marcarCopiasPorClave } from './marcar-duplicados.helper';

/**
 * Decisiones puras de la fusión de cuentas (ADR-014): qué cuentas se unen,
 * qué movimientos son duplicados, cómo se corresponden las categorías y qué
 * patrones se descartan. El repositorio solo lee, aplica y borra.
 */

export interface CuentaParaFusion {
  readonly id: string;
  readonly banco: string;
  readonly tipoCuenta: string;
  /** `null` solo durante la ventana de migración del blind index. */
  readonly numeroCuentaBlindIndex: string | null;
}

/** Movimiento con `descripcion` ya descifrada (ADR-009). */
export interface MovimientoParaFusion {
  readonly id: string;
  readonly fecha: Date;
  readonly descripcion: string;
  readonly cargo: bigint;
  readonly abono: bigint;
}

export interface CategoriaParaFusion {
  readonly id: string;
  readonly bucketId: string;
  readonly nombre: string;
}

export interface PatronParaFusion {
  readonly id: string;
  readonly patron: string;
  readonly categoriaId: string;
}

export interface CuentasUnidasYMovidas {
  /** Cuentas del origen que se funden con una del destino. */
  readonly unidas: ReadonlyArray<{ origenId: string; destinoId: string }>;
  /** Ids de las cuentas del origen que pasan tal cual al destino. */
  readonly movidas: ReadonlyArray<string>;
}

/**
 * S3(a). La identidad de una cuenta entre usuarios es
 * `(banco, tipoCuenta, numeroCuentaBlindIndex)`; un blind index nulo nunca
 * coincide. La cuenta de movimientos manuales sigue la misma regla.
 */
export function unirCuentas(
  origen: ReadonlyArray<CuentaParaFusion>,
  destino: ReadonlyArray<CuentaParaFusion>,
): CuentasUnidasYMovidas {
  const destinoPorClave = new Map<string, string>();
  for (const cuenta of destino) {
    const clave = claveDeCuenta(cuenta);
    if (clave !== null) destinoPorClave.set(clave, cuenta.id);
  }

  const unidas: Array<{ origenId: string; destinoId: string }> = [];
  const movidas: string[] = [];
  for (const cuenta of origen) {
    const clave = claveDeCuenta(cuenta);
    const destinoId = clave === null ? undefined : destinoPorClave.get(clave);
    if (destinoId === undefined) {
      movidas.push(cuenta.id);
    } else {
      unidas.push({ origenId: cuenta.id, destinoId });
    }
  }

  return { unidas, movidas };
}

function claveDeCuenta(cuenta: CuentaParaFusion): string | null {
  if (cuenta.numeroCuentaBlindIndex === null) return null;

  return JSON.stringify([
    cuenta.banco,
    cuenta.tipoCuenta,
    cuenta.numeroCuentaBlindIndex,
  ]);
}

function claveDeMovimiento(m: MovimientoParaFusion): string {
  return construirClaveDuplicado({
    fecha: m.fecha,
    descripcion: m.descripcion,
    cargo: m.cargo.toString(),
    abono: m.abono.toString(),
  });
}

/**
 * S3(b). La regla de duplicados de la ingesta (`marcarCopiasPorClave`): lo que
 * el destino ya tiene se descarta contando copias; el resto se mueve. El
 * orden de `origen` decide qué copia se descarta, así que el repositorio lo
 * entrega ordenado.
 */
export function clasificarMovimientosUnidos(
  destino: ReadonlyArray<MovimientoParaFusion>,
  origen: ReadonlyArray<MovimientoParaFusion>,
): { duplicadosIds: string[]; movidosIds: string[] } {
  const marcas = marcarCopiasPorClave(
    destino.map(claveDeMovimiento),
    origen.map(claveDeMovimiento),
  );

  const duplicadosIds: string[] = [];
  const movidosIds: string[] = [];
  origen.forEach((movimiento, i) => {
    (marcas[i] ? duplicadosIds : movidosIds).push(movimiento.id);
  });

  return { duplicadosIds, movidosIds };
}

/**
 * S3(d). Una categoría del origen con el mismo `(bucketId, nombre)` que una
 * del destino se reemplaza por ella; las demás se mueven.
 */
export function planificarCategorias(
  origen: ReadonlyArray<CategoriaParaFusion>,
  destino: ReadonlyArray<CategoriaParaFusion>,
): {
  reemplazos: Array<{ origenId: string; destinoId: string }>;
  movidasIds: string[];
} {
  const destinoPorClave = new Map<string, string>();
  for (const categoria of destino) {
    destinoPorClave.set(claveDeCategoria(categoria), categoria.id);
  }

  const reemplazos: Array<{ origenId: string; destinoId: string }> = [];
  const movidasIds: string[] = [];
  for (const categoria of origen) {
    const destinoId = destinoPorClave.get(claveDeCategoria(categoria));
    if (destinoId === undefined) {
      movidasIds.push(categoria.id);
    } else {
      reemplazos.push({ origenId: categoria.id, destinoId });
    }
  }

  return { reemplazos, movidasIds };
}

function claveDeCategoria(c: CategoriaParaFusion): string {
  return JSON.stringify([c.bucketId, c.nombre]);
}

/**
 * S3(e). Un patrón del origen cuyo texto ya existe entre los del destino, con
 * el mismo plegado de la creación de patrones (`buscarPatronPorTexto`), se
 * descarta; los demás se mueven.
 */
export function planificarPatrones(
  origen: ReadonlyArray<PatronParaFusion>,
  destino: ReadonlyArray<PatronParaFusion>,
): { descartadosIds: string[]; movidosIds: string[] } {
  const descartadosIds: string[] = [];
  const movidosIds: string[] = [];
  for (const patron of origen) {
    const existe = buscarPatronPorTexto(destino, patron.patron) !== undefined;
    (existe ? descartadosIds : movidosIds).push(patron.id);
  }

  return { descartadosIds, movidosIds };
}
