import type { PrismaClient } from '@prisma/client';

import type { IBancosImportadosReader } from '../../application/ports/bancos-importados-reader.port';

/** `Account.banco` of the account that holds hand-registered movements. */
const BANCO_MANUAL = 'Manual';

/**
 * PrismaBancosImportadosReader — distinct banks of the user's accounts, by the
 * creation of the first account in each. Scoped by `userId` (RNF-SEC-006).
 */
export class PrismaBancosImportadosReader implements IBancosImportadosReader {
  constructor(private readonly prisma: PrismaClient) {}

  async bancosEnOrdenDeImportacion(userId: string): Promise<string[]> {
    const cuentas = await this.prisma.account.findMany({
      where: { userId, banco: { not: BANCO_MANUAL } },
      select: { banco: true },
      orderBy: [{ creadoEn: 'asc' }, { id: 'asc' }],
    });

    return [...new Set(cuentas.map((cuenta) => cuenta.banco))];
  }
}
