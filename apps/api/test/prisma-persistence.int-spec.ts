import 'dotenv/config';
import { PrismaService } from '../src/infrastructure/persistence/prisma.service';
import { PrismaIngestaRepository } from '../src/infrastructure/persistence/prisma-ingesta.repository';
import { PrismaTransaccionRepository } from '../src/infrastructure/persistence/prisma-transaccion.repository';
import { PrismaAccountRepository } from '../src/infrastructure/persistence/prisma-account.repository';
import { NoOpCryptoService } from '../src/infrastructure/persistence/no-op-crypto.service';
import { Transaccion } from '../src/domain/value-objects/transaccion';
import { BancoConocido } from '../src/domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../src/domain/value-objects/tipo-cuenta';
import { DetectedBank } from '../src/application/ports/bank-detector.port';
import { PersistenciaFallidaError } from '../src/domain/errors/persistencia-fallida.error';

const RUN_ID = `it3a-${Date.now()}`;
const USER_ID = `user-${RUN_ID}`;

describe('Prisma persistence integration (real dev DB)', () => {
  const prisma = new PrismaService();
  const crypto = new NoOpCryptoService();
  const ingestaRepo = new PrismaIngestaRepository(prisma, crypto);
  const transaccionRepo = new PrismaTransaccionRepository(prisma, crypto);
  const accountRepo = new PrismaAccountRepository(prisma);

  const createdIngestaIds: string[] = [];
  let accountId: string;

  const detected: DetectedBank = {
    banco: BancoConocido.BancoEstado,
    tipoCuenta: TipoCuentaConocido.CuentaCorriente,
    numeroCuenta: `NUM-${RUN_ID}`,
  };

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({ data: { id: USER_ID, nombre: 'Test User' } });
  });

  afterAll(async () => {
    // Limpieza en orden FK inverso (ON DELETE RESTRICT).
    await prisma.transaccion.deleteMany({
      where: { ingestaId: { in: createdIngestaIds } },
    });
    await prisma.ingesta.deleteMany({
      where: { id: { in: createdIngestaIds } },
    });
    await prisma.account.deleteMany({ where: { userId: USER_ID } });
    await prisma.user.deleteMany({ where: { id: USER_ID } });
    await prisma.$disconnect();
  });

  describe('PrismaAccountRepository.ensure', () => {
    it('crea la cuenta y es idempotente por clave natural (userId,banco,tipoCuenta,numeroCuenta)', async () => {
      const first = await accountRepo.ensure(USER_ID, detected);
      const second = await accountRepo.ensure(USER_ID, detected);

      expect(first.isOk()).toBe(true);
      expect(second.isOk()).toBe(true);
      accountId = first.getValue().accountId;
      expect(second.getValue().accountId).toBe(accountId);

      const count = await prisma.account.count({
        where: { userId: USER_ID, numeroCuenta: detected.numeroCuenta },
      });
      expect(count).toBe(1);
    });
  });

  describe('PrismaIngestaRepository — happy path + BigInt round-trip', () => {
    it('createPending → commit persiste filas con FK y round-trip BigInt; findByIngesta las lee', async () => {
      const pending = await ingestaRepo.createPending({
        accountId,
        banco: 'BancoEstado',
        nombreArchivo: 'mov.xlsx',
      });
      expect(pending.isOk()).toBe(true);
      const ingestaId = pending.getValue().ingestaId;
      createdIngestaIds.push(ingestaId);

      const txs: Transaccion[] = [
        Transaccion.crear({
          fecha: new Date('2026-05-14T00:00:00.000Z'),
          descripcion: 'Compra',
          cargo: 8103,
          abono: 0,
        }).getValue(),
        // abono en Number.MAX_SAFE_INTEGER: prueba round-trip BigInt sin pérdida.
        Transaccion.crear({
          fecha: new Date('2026-05-15T00:00:00.000Z'),
          descripcion: 'Sueldo',
          cargo: 0,
          abono: 9007199254740991,
        }).getValue(),
      ];

      const committed = await ingestaRepo.commit(ingestaId, accountId, txs);
      expect(committed.isOk()).toBe(true);
      expect(committed.getValue().total).toBe(2);

      const ingesta = await prisma.ingesta.findUnique({
        where: { id: ingestaId },
      });
      expect(ingesta?.estado).toBe('PROCESADA');
      expect(ingesta?.totalTransacciones).toBe(2);
      expect(ingesta?.procesadoEn).toBeInstanceOf(Date);

      const rows = await prisma.transaccion.findMany({ where: { ingestaId } });
      expect(rows).toHaveLength(2);
      expect(
        rows.every(
          (r) => r.accountId === accountId && r.ingestaId === ingestaId,
        ),
      ).toBe(true);
      expect(rows.every((r) => r.bucketId === null)).toBe(true);

      const leidas = await transaccionRepo.findByIngesta(ingestaId);
      expect(leidas).toEqual(txs);
    });

    it('lista vacía → PROCESADA total 0, cero filas', async () => {
      const pending = await ingestaRepo.createPending({
        accountId,
        banco: 'BancoEstado',
        nombreArchivo: 'vacio.xlsx',
      });
      const ingestaId = pending.getValue().ingestaId;
      createdIngestaIds.push(ingestaId);

      const committed = await ingestaRepo.commit(ingestaId, accountId, []);
      expect(committed.isOk()).toBe(true);
      expect(committed.getValue().total).toBe(0);

      const ingesta = await prisma.ingesta.findUnique({
        where: { id: ingestaId },
      });
      expect(ingesta?.estado).toBe('PROCESADA');
      expect(ingesta?.totalTransacciones).toBe(0);
      expect(await prisma.transaccion.count({ where: { ingestaId } })).toBe(0);
    });
  });

  describe('W3 — real $transaction atomicity', () => {
    it('un fallo a mitad del $transaction deja 0 filas y NO transiciona; markFailed → FALLIDA', async () => {
      const pending = await ingestaRepo.createPending({
        accountId,
        banco: 'BancoEstado',
        nombreArchivo: 'atomic.xlsx',
      });
      const ingestaId = pending.getValue().ingestaId;
      createdIngestaIds.push(ingestaId);

      // La 2da fila viola CHECK (cargo >= 0) → aborta TODO el $transaction.
      // El cast `as unknown as Transaccion` es DELIBERADO: evade el invariante
      // del dominio a propósito para probar la defensa de ÚLTIMA línea (CHECK
      // de Postgres), que protege una frontera física distinta — datos que
      // llegan a la DB SIN pasar por `Transaccion.crear` (SQL directo,
      // migraciones, otro cliente). Esa defensa se conserva por decisión
      // explícita, aunque el dominio ya bloquee este dato en su único punto
      // de construcción.
      const txs: Transaccion[] = [
        Transaccion.crear({
          fecha: new Date('2026-05-14T00:00:00.000Z'),
          descripcion: 'ok',
          cargo: 100,
          abono: 0,
        }).getValue(),
        {
          fecha: new Date('2026-05-15T00:00:00.000Z'),
          descripcion: 'bad',
          cargo: -1,
          abono: 0,
        } as unknown as Transaccion,
      ];

      const committed = await ingestaRepo.commit(ingestaId, accountId, txs);
      expect(committed.isFail()).toBe(true);
      expect(committed.getError()).toBeInstanceOf(PersistenciaFallidaError);

      // Atomicidad: 0 filas y la Ingesta sigue PENDIENTE (update revertido).
      expect(await prisma.transaccion.count({ where: { ingestaId } })).toBe(0);
      const afterCommit = await prisma.ingesta.findUnique({
        where: { id: ingestaId },
      });
      expect(afterCommit?.estado).toBe('PENDIENTE');

      // El orquestador (PR3b) marcaría FALLIDA; el repo lo soporta sin lanzar.
      const marked = await ingestaRepo.markFailed(
        ingestaId,
        'fallo atómico de prueba',
      );
      expect(marked.isOk()).toBe(true);
      const afterFail = await prisma.ingesta.findUnique({
        where: { id: ingestaId },
      });
      expect(afterFail?.estado).toBe('FALLIDA');
      expect(afterFail?.motivoFallo).toBe('fallo atómico de prueba');
    });

    it('rollback de DOS sentencias: si la 2da (update) falla DESPUÉS de createMany, se revierten las filas insertadas', async () => {
      const pending = await ingestaRepo.createPending({
        accountId,
        banco: 'BancoEstado',
        nombreArchivo: 'twostmt.xlsx',
      });
      const ingestaId = pending.getValue().ingestaId;
      createdIngestaIds.push(ingestaId);

      // Fuerza que la SEGUNDA operación (ingesta.update) falle a nivel de BD
      // DESPUÉS de que createMany ya insertó dentro del $transaction: el update
      // apunta a un id inexistente → P2025 en ejecución → rollback de TODO.
      // Esto distingue "$transaction se usa" de "orden afortunado".
      const realUpdate = prisma.ingesta.update.bind(prisma.ingesta);
      const spy = vi
        .spyOn(prisma.ingesta, 'update')
        .mockImplementationOnce(() =>
          realUpdate({
            where: { id: `inexistente-${ingestaId}` },
            data: { motivoFallo: 'forzado' },
          }),
        );

      try {
        const txs: Transaccion[] = [
          Transaccion.crear({
            fecha: new Date('2026-05-14T00:00:00.000Z'),
            descripcion: 'a',
            cargo: 100,
            abono: 0,
          }).getValue(),
          Transaccion.crear({
            fecha: new Date('2026-05-15T00:00:00.000Z'),
            descripcion: 'b',
            cargo: 200,
            abono: 0,
          }).getValue(),
        ];

        const committed = await ingestaRepo.commit(ingestaId, accountId, txs);
        expect(committed.isFail()).toBe(true);
        expect(committed.getError()).toBeInstanceOf(PersistenciaFallidaError);

        // Prueba REAL de atomicidad de dos sentencias: createMany insertó dentro
        // de la tx, pero el fallo del update revirtió TODO → 0 filas.
        expect(await prisma.transaccion.count({ where: { ingestaId } })).toBe(
          0,
        );
        const ingesta = await prisma.ingesta.findUnique({
          where: { id: ingestaId },
        });
        expect(ingesta?.estado).toBe('PENDIENTE');
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('R3 — mapeo de errores de infraestructura a Result.fail', () => {
    it('markFailed con ingestaId inexistente → Result.fail(PersistenciaFallidaError), sin lanzar', async () => {
      const result = await ingestaRepo.markFailed(
        `inexistente-${RUN_ID}`,
        'motivo',
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PersistenciaFallidaError);
    });

    it('createPending con accountId inexistente (FK) → Result.fail(PersistenciaFallidaError), sin lanzar', async () => {
      const result = await ingestaRepo.createPending({
        accountId: `cuenta-inexistente-${RUN_ID}`,
        banco: 'BancoEstado',
        nombreArchivo: 'fk.xlsx',
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PersistenciaFallidaError);
    });
  });

  describe('CHECK cargo/abono no negativos', () => {
    it('un abono negativo es rechazado por la CHECK (0 filas, commit falla)', async () => {
      const pending = await ingestaRepo.createPending({
        accountId,
        banco: 'BancoEstado',
        nombreArchivo: 'negabono.xlsx',
      });
      const ingestaId = pending.getValue().ingestaId;
      createdIngestaIds.push(ingestaId);

      // Cast DELIBERADO (ver caso cargo=-1 arriba): evade el invariante del
      // dominio para probar la CHECK de Postgres como defensa física de última
      // línea. Conservado por decisión explícita.
      const txs: Transaccion[] = [
        {
          fecha: new Date('2026-05-14T00:00:00.000Z'),
          descripcion: 'neg',
          cargo: 0,
          abono: -5,
        } as unknown as Transaccion,
      ];

      const committed = await ingestaRepo.commit(ingestaId, accountId, txs);
      expect(committed.isFail()).toBe(true);
      expect(await prisma.transaccion.count({ where: { ingestaId } })).toBe(0);
    });
  });

  describe('read-path BigInt overflow guard (DB boundary)', () => {
    it('un valor > 2^53-1 insertado por SQL crudo hace que findByIngesta lance RangeError', async () => {
      const pending = await ingestaRepo.createPending({
        accountId,
        banco: 'BancoEstado',
        nombreArchivo: 'overflow.xlsx',
      });
      const ingestaId = pending.getValue().ingestaId;
      createdIngestaIds.push(ingestaId);

      // Inserta directamente (sin el mapper) un cargo por encima de MAX_SAFE_INTEGER.
      await prisma.transaccion.create({
        data: {
          ingestaId,
          accountId,
          fecha: new Date('2026-05-14T00:00:00.000Z'),
          descripcion: 'overflow',
          cargo: BigInt('9007199254740993'), // 2^53 + 1
          abono: 0n,
        },
      });

      await expect(transaccionRepo.findByIngesta(ingestaId)).rejects.toThrow(
        RangeError,
      );
    });
  });
});
