import { EstadoIngesta } from '@prisma/client';
import {
  CrearDemoInput,
  CrearDemoResult,
  IDemoRepository,
} from '../../application/ports/demo-repository.port';
import { IReloj } from '../../application/ports/reloj.port';
import { DEMO_TRANSACCIONES } from '../../../prisma/demo-data';
import { seedDemoTransacciones } from '../http/auth/demo-data-seeder';
import { PrismaService } from './prisma.service';
import { BUCKET_IDS } from './bucket-ids';

const BANCO_DEMO = 'MoneyDiary Demo';
const TIPO_CUENTA_DEMO = 'Cuenta Corriente';
const NUMERO_CUENTA_DEMO = 'DEMO-0000';

/**
 * PrismaDemoRepository — implementación de `IDemoRepository` (design.md §5).
 *
 * Crea User+Account+Ingesta+Transacciones en una única transacción
 * interactiva de Prisma (DEMO-DATA-04) — si cualquier paso falla, nada se
 * persiste. Usa `$transaction(async (tx) => ...)` (no el estilo array) porque
 * cada paso depende del id generado por el anterior (user.id → account.id →
 * ingesta.id), a diferencia de `PrismaIngestaRepository.commit` que sí puede
 * usar el estilo array (sus dos operaciones son independientes entre sí).
 */
export class PrismaDemoRepository implements IDemoRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reloj: IReloj,
  ) {}

  async crear(input: CrearDemoInput): Promise<CrearDemoResult> {
    const ahora = this.reloj.ahora();

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          nombre: input.nombre,
          esDemo: true,
          demoCreatedAt: ahora,
        },
      });

      const account = await tx.account.create({
        data: {
          userId: user.id,
          banco: BANCO_DEMO,
          tipoCuenta: TIPO_CUENTA_DEMO,
          numeroCuenta: NUMERO_CUENTA_DEMO,
        },
      });

      const ingesta = await tx.ingesta.create({
        data: {
          accountId: account.id,
          banco: BANCO_DEMO,
          nombreArchivo: 'demo-seed',
          estado: EstadoIngesta.PROCESADA,
          totalTransacciones: DEMO_TRANSACCIONES.length,
          procesadoEn: ahora,
        },
      });

      const transacciones = seedDemoTransacciones(
        DEMO_TRANSACCIONES,
        BUCKET_IDS,
        account.id,
        ingesta.id,
        ahora,
      );

      await tx.transaccion.createMany({ data: transacciones });

      return { userId: user.id, accountId: account.id };
    });
  }
}
