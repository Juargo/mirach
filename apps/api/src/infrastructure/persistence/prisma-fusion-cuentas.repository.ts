import { Prisma, type PrismaClient } from '@prisma/client';

import type { ICryptoService } from '../../application/ports/crypto-service.port';
import type {
  IFusionCuentasRepository,
  ResumenFusion,
} from '../../application/ports/fusion-cuentas-repository.port';
import {
  clasificarMovimientosUnidos,
  planificarCategorias,
  planificarPatrones,
  unirCuentas,
  type MovimientoParaFusion,
} from '../../application/use-cases/planificar-fusion.helper';

/** Una cuenta es anónima cuando no tiene NINGUNA credencial (ADR-013). */
const SIN_CREDENCIALES = {
  appleSub: null,
  googleSub: null,
  passwordHash: null,
} as const;

/**
 * La fusión descifra y compara en memoria los movimientos de las cuentas
 * unidas (ADR-014): con muchos movimientos supera el timeout por defecto (5 s)
 * de las transacciones interactivas.
 */
const OPCIONES_TRANSACCION = { maxWait: 10_000, timeout: 120_000 } as const;

type Tx = Prisma.TransactionClient;

/**
 * PrismaFusionCuentasRepository — implementación de `IFusionCuentasRepository`
 * (ADR-014). TODA la fusión es UNA transacción interactiva.
 *
 * Las decisiones (qué cuentas se unen, qué movimientos son duplicados, cómo
 * se corresponden categorías y patrones) son funciones puras de
 * `planificar-fusion.helper`; aquí solo se leen los datos, se aplica el plan
 * y se borra el origen. La orquestación vive en el repositorio porque leer,
 * decidir y escribir tienen que ocurrir dentro de la misma transacción.
 *
 * Orden de escritura, no intercambiable:
 * - Todas las FK son RESTRICT salvo `Transaccion.categoriaId` y `bucketId`
 *   (SET NULL): los movimientos y los patrones se reapuntan ANTES de borrar
 *   cualquier categoría, o las categorías de los movimientos se borrarían en
 *   silencio.
 * - `PatronClasificacion(categoriaId, userId)` → `Categoria(id, userId)` es ON
 *   UPDATE CASCADE: un patrón reapuntado a una categoría del destino cambia
 *   `categoriaId` y `userId` en el MISMO update.
 *
 * Aislamiento (RNF-SEC-006): cada consulta filtra por el `userId` del origen o
 * del destino en el WHERE (los movimientos, por `account: { userId }`).
 * Redacción (ADR-009): `descripcion` se descifra solo en memoria, nunca se
 * loguea ni se compara el texto cifrado.
 */
export class PrismaFusionCuentasRepository implements IFusionCuentasRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly crypto: ICryptoService,
  ) {}

  async fusionar(
    origenUserId: string,
    destinoUserId: string,
  ): Promise<ResumenFusion | null> {
    return this.prisma.$transaction(
      (tx) => this.fusionarEn(tx, origenUserId, destinoUserId),
      OPCIONES_TRANSACCION,
    );
  }

  private async fusionarEn(
    tx: Tx,
    origenId: string,
    destinoId: string,
  ): Promise<ResumenFusion | null> {
    if (!(await this.bloquearYComprobar(tx, origenId, destinoId))) {
      return null;
    }

    const cuentasOrigen = await tx.account.findMany({
      where: { userId: origenId },
      select: {
        id: true,
        banco: true,
        tipoCuenta: true,
        numeroCuentaBlindIndex: true,
      },
    });
    const cuentasDestino = await tx.account.findMany({
      where: { userId: destinoId },
      select: {
        id: true,
        banco: true,
        tipoCuenta: true,
        numeroCuentaBlindIndex: true,
      },
    });
    const { unidas, movidas } = unirCuentas(cuentasOrigen, cuentasDestino);

    let movimientosMovidos = 0;
    let duplicadosOmitidos = 0;
    for (const par of unidas) {
      const destino = await this.leerMovimientos(tx, destinoId, par.destinoId);
      const origen = await this.leerMovimientos(tx, origenId, par.origenId);
      const { duplicadosIds, movidosIds } = clasificarMovimientosUnidos(
        destino,
        origen,
      );
      duplicadosOmitidos += duplicadosIds.length;
      movimientosMovidos += movidosIds.length;

      if (duplicadosIds.length > 0) {
        await tx.transaccion.deleteMany({
          where: {
            id: { in: duplicadosIds },
            accountId: par.origenId,
            account: { userId: origenId },
          },
        });
      }
      await tx.transaccion.updateMany({
        where: { accountId: par.origenId, account: { userId: origenId } },
        data: { accountId: par.destinoId },
      });
      await tx.ingesta.updateMany({
        where: { userId: origenId, accountId: par.origenId },
        data: { userId: destinoId, accountId: par.destinoId },
      });
      await tx.account.deleteMany({
        where: { id: par.origenId, userId: origenId },
      });
    }

    if (movidas.length > 0) {
      movimientosMovidos += await tx.transaccion.count({
        where: {
          accountId: { in: [...movidas] },
          account: { userId: origenId },
        },
      });
      await tx.account.updateMany({
        where: { id: { in: [...movidas] }, userId: origenId },
        data: { userId: destinoId },
      });
    }
    // Las ingestas de cuentas movidas, o sin cuenta (fallidas), pasan al destino.
    await tx.ingesta.updateMany({
      where: { userId: origenId },
      data: { userId: destinoId },
    });

    const categoriasOrigen = await tx.categoria.findMany({
      where: { userId: origenId },
      select: { id: true, bucketId: true, nombre: true },
    });
    const categoriasDestino = await tx.categoria.findMany({
      where: { userId: destinoId },
      select: { id: true, bucketId: true, nombre: true },
    });
    const categorias = planificarCategorias(
      categoriasOrigen,
      categoriasDestino,
    );

    const patronesOrigen = await tx.patronClasificacion.findMany({
      where: { userId: origenId },
      select: { id: true, patron: true, categoriaId: true },
    });
    const patronesDestino = await tx.patronClasificacion.findMany({
      where: { userId: destinoId },
      select: { id: true, patron: true, categoriaId: true },
    });
    const patrones = planificarPatrones(patronesOrigen, patronesDestino);

    if (patrones.descartadosIds.length > 0) {
      await tx.patronClasificacion.deleteMany({
        where: { id: { in: patrones.descartadosIds }, userId: origenId },
      });
    }
    for (const { origenId: desde, destinoId: hacia } of categorias.reemplazos) {
      await tx.transaccion.updateMany({
        where: { categoriaId: desde, account: { userId: destinoId } },
        data: { categoriaId: hacia },
      });
      await tx.patronClasificacion.updateMany({
        where: { categoriaId: desde, userId: origenId },
        data: { categoriaId: hacia, userId: destinoId },
      });
    }
    if (categorias.movidasIds.length > 0) {
      await tx.categoria.updateMany({
        where: { id: { in: categorias.movidasIds }, userId: origenId },
        data: { userId: destinoId },
      });
    }
    if (categorias.reemplazos.length > 0) {
      await tx.categoria.deleteMany({
        where: {
          id: { in: categorias.reemplazos.map((r) => r.origenId) },
          userId: origenId,
        },
      });
    }

    await tx.session.deleteMany({ where: { userId: origenId } });
    await tx.consentimiento.deleteMany({ where: { userId: origenId } });
    await tx.user.delete({ where: { id: origenId } });

    return {
      cuentasMovidas: movidas.length,
      cuentasUnidas: unidas.length,
      movimientosMovidos,
      duplicadosOmitidos,
      categoriasMovidas: categorias.movidasIds.length,
      patronesMovidos: patrones.movidosIds.length,
    };
  }

  /**
   * Bloquea las dos filas de `User` en orden de id (dos fusiones cruzadas no
   * pueden abrazarse) y vuelve a comprobar, ya bajo el bloqueo, que existen y
   * que el origen sigue siendo anónimo.
   */
  private async bloquearYComprobar(
    tx: Tx,
    origenId: string,
    destinoId: string,
  ): Promise<boolean> {
    const ids = [origenId, destinoId].sort();
    for (const id of ids) {
      const filas = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`,
      );
      if (filas.length !== 1) return false;
    }

    const origen = await tx.user.findFirst({
      where: { id: origenId, ...SIN_CREDENCIALES },
      select: { id: true },
    });
    const destino = await tx.user.findUnique({
      where: { id: destinoId },
      select: { id: true },
    });

    return origen !== null && destino !== null;
  }

  /**
   * Movimientos de UNA cuenta del usuario, con `descripcion` descifrada, en un
   * orden estable: el orden decide qué copia de un duplicado se descarta.
   */
  private async leerMovimientos(
    tx: Tx,
    userId: string,
    accountId: string,
  ): Promise<MovimientoParaFusion[]> {
    const filas = await tx.transaccion.findMany({
      where: { accountId, account: { userId } },
      select: {
        id: true,
        fecha: true,
        descripcion: true,
        cargo: true,
        abono: true,
      },
      orderBy: [{ fecha: 'asc' }, { creadoEn: 'asc' }, { id: 'asc' }],
    });

    return filas.map((fila) => ({
      ...fila,
      descripcion: this.crypto.decrypt(fila.descripcion),
    }));
  }
}
