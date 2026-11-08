import type { PrismaClient } from '@prisma/client';
import {
  IMovimientosParaAprenderReader,
  MovimientoParaAprender,
} from '../../application/ports/movimientos-para-aprender.port';
import { ICryptoService } from '../../application/ports/crypto-service.port';
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import { filtroFechaPeriodo } from './periodo-filtro';

const SELECT = {
  id: true,
  fecha: true,
  descripcion: true,
  cargo: true,
  abono: true,
  categoriaId: true,
  clasificacionManual: true,
} as const;

/**
 * PrismaMovimientosParaAprenderReader — read side of the classification
 * learning flows (CLA-03, CLA-15). Mirrors `PrismaReevaluarCategoriasReader`:
 * `account: { userId }` in the SQL WHERE (RNF-SEC-006) and `descripcion`
 * decrypted here (ADR-009), because pattern matching runs on plaintext and
 * SQL can never match against the ciphertext.
 *
 * Unlike the reevaluation reader, the period is scoped IN SQL with the
 * shared `filtroFechaPeriodo` (the person's financial month), so only one
 * month is decrypted in memory.
 */
export class PrismaMovimientosParaAprenderReader implements IMovimientosParaAprenderReader {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly crypto: ICryptoService,
  ) {}

  async buscarDelPeriodo(
    userId: string,
    periodo: PeriodoMes,
  ): Promise<ReadonlyArray<MovimientoParaAprender>> {
    const rows = await this.prisma.transaccion.findMany({
      where: { account: { userId }, ...filtroFechaPeriodo(periodo) },
      select: SELECT,
      orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.aMovimiento(row));
  }

  async buscarPorId(
    userId: string,
    id: string,
  ): Promise<MovimientoParaAprender | null> {
    const row = await this.prisma.transaccion.findFirst({
      where: { id, account: { userId } },
      select: SELECT,
    });
    return row === null ? null : this.aMovimiento(row);
  }

  private aMovimiento(row: {
    id: string;
    fecha: Date;
    descripcion: string;
    cargo: bigint;
    abono: bigint;
    categoriaId: string | null;
    clasificacionManual: boolean;
  }): MovimientoParaAprender {
    return {
      id: row.id,
      fecha: row.fecha,
      descripcion: this.crypto.decrypt(row.descripcion),
      cargo: row.cargo,
      abono: row.abono,
      categoriaIdActual: row.categoriaId,
      clasificacionManual: row.clasificacionManual,
    };
  }
}
