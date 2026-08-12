import { EstadoIngesta } from '@prisma/client';
import {
  CrearDemoInput,
  CrearDemoResult,
  IDemoRepository,
} from '../../application/ports/demo-repository.port';
import { IReloj } from '../../application/ports/reloj.port';
import { ICryptoService } from '../../application/ports/crypto-service.port';
import { IBlindIndexService } from '../../application/ports/blind-index-service.port';
import { DEMO_TRANSACCIONES } from './demo-data';
import { seedDemoTransacciones } from './demo-data-seeder';
import type { PrismaClient } from '@prisma/client';
import { BUCKET_IDS } from './bucket-ids';
import { normalizeNumeroCuenta } from './normalize-numero-cuenta';
import { copiarCatalogoTemplate } from './catalogo-template';

const BANCO_DEMO = 'MoneyDiary Demo';
const TIPO_CUENTA_DEMO = 'Cuenta Corriente';
const NUMERO_CUENTA_DEMO = 'DEMO-0000';

/**
 * PrismaDemoRepository — implementación de `IDemoRepository` (design.md §5).
 *
 * Crea User+Account+Ingesta+Transacciones+Session en una única transacción
 * interactiva de Prisma (DEMO-DATA-04, extendido por fix crítico
 * judgment-day) — si cualquier paso falla (incluida la Session), nada se
 * persiste; no puede quedar un usuario demo huérfano sin sesión. Usa
 * `$transaction(async (tx) => ...)` (no el estilo array) porque cada paso
 * depende del id generado por el anterior (user.id → account.id →
 * ingesta.id), a diferencia de `PrismaIngestaRepository.commit` que sí puede
 * usar el estilo array (sus dos operaciones son independientes entre sí).
 *
 * US-035 Slice 2: el Account demo también persiste `numeroCuenta` CIFRADO +
 * su `numeroCuentaBlindIndex` — mismo tratamiento que cualquier cuenta real
 * (ver `PrismaAccountRepository.ensure`), para que el demo no sea la única
 * fila de `Account` con el número en claro.
 */
export class PrismaDemoRepository implements IDemoRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly reloj: IReloj,
    private readonly crypto: ICryptoService,
    private readonly blindIndex: IBlindIndexService,
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

      // US-037 (design.md §6): copia el catálogo del template INMEDIATAMENTE
      // después de crear el usuario, dentro de la MISMA transacción — si la
      // copia falla, `copiarCatalogoTemplate` lanza (no retorna `Result`,
      // ver su docstring) y el rollback incluye también al usuario recién
      // creado, igual que el fix crítico de la Session más abajo. El demo
      // recibe la copia SOLO para clasificar (read-only por decisión de
      // producto) — no hay superficie de escritura del catálogo aquí.
      await copiarCatalogoTemplate(tx, user.id);

      const numeroCuentaNormalizado = normalizeNumeroCuenta(NUMERO_CUENTA_DEMO);
      const account = await tx.account.create({
        data: {
          userId: user.id,
          banco: BANCO_DEMO,
          tipoCuenta: TIPO_CUENTA_DEMO,
          numeroCuenta: this.crypto.encrypt(numeroCuentaNormalizado),
          numeroCuentaBlindIndex: this.blindIndex.compute(
            numeroCuentaNormalizado,
          ),
        },
      });

      const ingesta = await tx.ingesta.create({
        data: {
          userId: user.id,
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
        this.crypto,
      );

      await tx.transaccion.createMany({ data: transacciones });

      // La sesión se crea EN LA MISMA transacción (fix crítico judgment-day
      // — DEMO-DATA-04 extendido): si este insert falla, el rollback incluye
      // al usuario recién creado. Antes `sessions.crear()` corría por fuera,
      // como una escritura separada — si fallaba, quedaba un usuario demo
      // huérfano (creado pero sin sesión) hasta que la limpieza lo alcanzara.
      await tx.session.create({
        data: {
          userId: user.id,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
        },
      });

      return { userId: user.id, accountId: account.id };
    });
  }
}
