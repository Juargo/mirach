import { Transaccion } from '../../domain/value-objects/transaccion';
import { ICryptoService } from '../../application/ports/crypto-service.port';
import { ITransaccionRepository } from '../../application/ports/transaccion-repository.port';
import { PrismaService } from './prisma.service';
import { aDominio } from './transaccion.mapper';

/**
 * PrismaTransaccionRepository — implementación Prisma del lado de lectura.
 *
 * Lee las transacciones persistidas de una Ingesta y las mapea de vuelta al
 * dominio (BigInt→number con guardas, descifrado vía crypto). Devuelve las
 * filas en orden de creación.
 */
export class PrismaTransaccionRepository implements ITransaccionRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: ICryptoService,
  ) {}

  async findByIngesta(ingestaId: string): Promise<ReadonlyArray<Transaccion>> {
    const rows = await this.prisma.transaccion.findMany({
      where: { ingestaId },
      orderBy: { creadoEn: 'asc' },
    });

    return rows.map((row) =>
      aDominio(
        {
          fecha: row.fecha,
          descripcion: row.descripcion,
          cargo: row.cargo,
          abono: row.abono,
          bucketId: row.bucketId,
        },
        this.crypto,
      ),
    );
  }
}
