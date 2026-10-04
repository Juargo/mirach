import type { Prisma } from '@prisma/client';

import { objetivosDeP2002 } from './p2002-objetivos';

/**
 * esCarreraDeCreacionUser — discrimina, para el P2002 de la creación de un
 * usuario desde una identidad externa, entre la carrera esperada (unicidad de
 * `User.emailBlindIndex` o de la columna `sub` del proveedor) y un P2002 real
 * de otra tabla dentro de la MISMA transacción (p. ej. la unique compuesta de
 * `Categoria`, un bug de datos y nunca una carrera sobre un `userId` recién
 * creado).
 *
 * Política deliberadamente conservadora: un `target` AUSENTE resuelve a
 * `true` (carrera) porque la única fila que compite dentro de la transacción
 * es la del propio `tx.user.create`. Solo un target que nombra una columna
 * ajena a `columnasEsperadas` es la señal positiva de un bug real.
 */
export function esCarreraDeCreacionUser(
  error: Prisma.PrismaClientKnownRequestError,
  columnasEsperadas: readonly string[],
): boolean {
  const targets = objetivosDeP2002(error.meta);

  if (targets.length === 0) return true;

  return targets.some((t) => columnasEsperadas.some((c) => t.includes(c)));
}
