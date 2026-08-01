import 'dotenv/config';
import * as fs from 'fs';
import { join } from 'path';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { crearProcessIngesta } from '../src/composition/crear-process-ingesta';
import { PrismaIngestaRepository } from '../src/infrastructure/persistence/prisma-ingesta.repository';
import { PrismaRegistrarIngestaFallidaRepository } from '../src/infrastructure/persistence/prisma-registrar-ingesta-fallida.repository';
import { PrismaListarIngestasReader } from '../src/infrastructure/persistence/prisma-listar-ingestas.reader';
import { AesGcmCryptoService } from '../src/infrastructure/persistence/aes-gcm-crypto.service';
import { Transaccion } from '../src/domain/value-objects/transaccion';
import { PersistenciaFallidaError } from '../src/domain/errors/persistencia-fallida.error';
import { IFileReader } from '../src/application/ports/file-reader.port';
import { buildTestEnv } from './support/env.fixture';

/**
 * Integration tests for the US-004 widened historial (design.md §10.2):
 * two-user pattern (RNF-SEC-006 isolation), the pipeline's early-failure
 * boundary registration end-to-end, the PROCESADA success invariant + its DB
 * CHECK, superset ordering (CA-01), and the persist-path collapse's
 * atomicity guarantee (equivalent to the deleted
 * prisma-persistence.int-spec.ts W3 case).
 *
 * Requires a live Postgres with ALLOW_DESTRUCTIVE_DB=1 — run via
 * `pnpm api test:integration` (vitest.int.config.ts, gated by
 * `test/integration.setup.ts` → `assertDestructiveDbAllowed()`). Intentionally
 * EXCLUDED from `pnpm api test` (same posture as the rest of `test/*.int-spec.ts`).
 */

const RUN_ID = `historialint-${Date.now()}`;
const USER_A = `user-a-${RUN_ID}`;
const USER_B = `user-b-${RUN_ID}`;
const USER_C = `user-c-${RUN_ID}`;

class BufferFileReader implements IFileReader {
  constructor(
    private readonly buffer: Buffer,
    private readonly originalName: string,
  ) {}
  getBuffer(): Buffer {
    return this.buffer;
  }
  getOriginalName(): string {
    return this.originalName;
  }
  getSizeInBytes(): number {
    return this.buffer.byteLength;
  }
}

describe('Historial de ingestas (US-004, integration — real dev DB)', () => {
  const prisma = createPrismaClient(loadEnv());
  const crypto = new AesGcmCryptoService(
    Buffer.from(buildTestEnv().ENCRYPTION_KEY, 'base64'),
  );
  const processIngesta = crearProcessIngesta(prisma, crypto);
  const ingestaRepo = new PrismaIngestaRepository(prisma, crypto);
  const fallidaWriter = new PrismaRegistrarIngestaFallidaRepository(prisma);
  const reader = new PrismaListarIngestasReader(prisma);

  let accountIdA: string | undefined;
  let accountIdC: string;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({ data: { id: USER_A, nombre: `A ${RUN_ID}` } });
    await prisma.user.create({ data: { id: USER_B, nombre: `B ${RUN_ID}` } });
    await prisma.user.create({ data: { id: USER_C, nombre: `C ${RUN_ID}` } });

    const accC = await prisma.account.create({
      data: {
        userId: USER_C,
        banco: 'BCI',
        tipoCuenta: 'Cuenta Corriente',
        numeroCuenta: `bci-c-${RUN_ID}`,
      },
    });
    accountIdC = accC.id;
  });

  afterAll(async () => {
    const accountIds = [accountIdA, accountIdC].filter(
      (id): id is string => !!id,
    );
    await prisma.transaccion.deleteMany({
      where: { accountId: { in: accountIds } },
    });
    // US-004: userId directo — cubre tanto las filas PROCESADA (con cuenta)
    // como las FALLIDA (accountId null) de los 3 usuarios de este spec.
    await prisma.ingesta.deleteMany({
      where: { userId: { in: [USER_A, USER_B, USER_C] } },
    });
    await prisma.account.deleteMany({ where: { id: { in: accountIds } } });
    await prisma.user.deleteMany({
      where: { id: { in: [USER_A, USER_B, USER_C] } },
    });
    await prisma.$disconnect();
  });

  describe('RNF-SEC-006 — el historial ampliado sigue aislado por usuario (ING-08)', () => {
    it('una fila FALLIDA de user B (sin cuenta) NUNCA aparece en el listado de user A; SÍ aparece en el de B', async () => {
      const registered = await fallidaWriter.registrar({
        userId: USER_B,
        nombreArchivo: `b-fallo-${RUN_ID}.xlsx`,
        motivo: 'banco no reconocido',
      });
      expect(registered.isOk()).toBe(true);

      const rowsA = await reader.listarPorUsuario(USER_A);
      expect(
        rowsA.some((r) => r.nombreArchivo === `b-fallo-${RUN_ID}.xlsx`),
      ).toBe(false);

      const rowsB = await reader.listarPorUsuario(USER_B);
      const filaB = rowsB.find(
        (r) => r.nombreArchivo === `b-fallo-${RUN_ID}.xlsx`,
      );
      expect(filaB).toBeDefined();
      expect(filaB?.estado).toBe('FALLIDA');
      expect(filaB?.banco).toBeNull();
      expect(filaB?.motivoFallo).toBe('banco no reconocido');
    });
  });

  describe('ING-07 — fallo temprano (extensión inválida) se registra como FALLIDA', () => {
    it('un .xls rechazado por extensión → Result.fail Y exactamente 1 fila FALLIDA con accountId/banco null', async () => {
      const fixture = join(__dirname, 'fixtures', 'cartola-test.xls');
      const buffer = fs.readFileSync(fixture);
      const nombreArchivo = `rechazo-ext-${RUN_ID}.xls`;

      const result = await processIngesta.execute({
        fileReader: new BufferFileReader(buffer, nombreArchivo),
        userId: USER_A,
      });

      expect(result.isFail()).toBe(true);

      const filas = await prisma.ingesta.findMany({
        where: { userId: USER_A, nombreArchivo },
      });
      expect(filas).toHaveLength(1);
      expect(filas[0].estado).toBe('FALLIDA');
      expect(filas[0].accountId).toBeNull();
      expect(filas[0].banco).toBeNull();
      expect(filas[0].motivoFallo).toBeTruthy();
    });
  });

  describe('Éxito — invariante PROCESADA ⟹ accountId/banco/totalTransacciones no-nulos + CHECK de BD', () => {
    it('una subida real (fixture BCI) crea 1 fila PROCESADA con accountId/banco/totalTransacciones no-nulos', async () => {
      const fixture = join(__dirname, 'fixtures', 'movimientos-test.xlsx');
      const buffer = fs.readFileSync(fixture);
      const nombreArchivo = `exito-${RUN_ID}.xlsx`;

      const result = await processIngesta.execute({
        fileReader: new BufferFileReader(buffer, nombreArchivo),
        userId: USER_A,
      });

      expect(result.isOk()).toBe(true);
      const { ingestaId } = result.getValue();

      const ingesta = await prisma.ingesta.findUnique({
        where: { id: ingestaId },
      });
      expect(ingesta?.estado).toBe('PROCESADA');
      expect(ingesta?.accountId).not.toBeNull();
      expect(ingesta?.banco).not.toBeNull();
      expect(ingesta?.totalTransacciones).not.toBeNull();
      expect(ingesta?.userId).toBe(USER_A);

      accountIdA = ingesta!.accountId!;
    });

    it('la CHECK Ingesta_procesada_requires_account rechaza un insert PROCESADA con accountId null', async () => {
      await expect(
        prisma.ingesta.create({
          data: {
            userId: USER_A,
            nombreArchivo: `check-violation-${RUN_ID}.xlsx`,
            estado: 'PROCESADA',
            accountId: null,
          },
        }),
      ).rejects.toThrow();

      // La CHECK rechazó el insert — no debe quedar ninguna fila con ese nombre.
      const count = await prisma.ingesta.count({
        where: {
          userId: USER_A,
          nombreArchivo: `check-violation-${RUN_ID}.xlsx`,
        },
      });
      expect(count).toBe(0);
    });
  });

  describe('CA-01 — superset ordering: PROCESADA + FALLIDA para el mismo usuario, creadoEn desc', () => {
    it('lista ambas filas ordenadas por creadoEn desc (la más reciente primero)', async () => {
      const antigua = new Date('2026-01-01T00:00:00.000Z');
      const reciente = new Date('2026-01-02T00:00:00.000Z');

      // Antigua: FALLIDA (accountId null).
      await prisma.ingesta.create({
        data: {
          userId: USER_C,
          nombreArchivo: `c-antigua-fallida-${RUN_ID}.xlsx`,
          estado: 'FALLIDA',
          motivoFallo: 'motivo antiguo',
          creadoEn: antigua,
        },
      });
      // Reciente: PROCESADA (con cuenta — invariante requiere accountId).
      await prisma.ingesta.create({
        data: {
          userId: USER_C,
          accountId: accountIdC,
          banco: 'BCI',
          nombreArchivo: `c-reciente-procesada-${RUN_ID}.xlsx`,
          estado: 'PROCESADA',
          totalTransacciones: 3,
          creadoEn: reciente,
        },
      });

      const rows = await reader.listarPorUsuario(USER_C);
      const nuestras = rows.filter((r) => r.nombreArchivo.includes(RUN_ID));
      expect(nuestras).toHaveLength(2);
      // La más reciente (PROCESADA) va PRIMERO — orden desc.
      expect(nuestras[0].nombreArchivo).toBe(
        `c-reciente-procesada-${RUN_ID}.xlsx`,
      );
      expect(nuestras[0].estado).toBe('PROCESADA');
      expect(nuestras[1].nombreArchivo).toBe(
        `c-antigua-fallida-${RUN_ID}.xlsx`,
      );
      expect(nuestras[1].estado).toBe('FALLIDA');
    });
  });

  describe('Atomicidad — persistirProcesada revierte TODO (equivalente al W3 case retirado, design §10.2)', () => {
    it('una fila con cargo negativo viola la CHECK de Transaccion → 0 filas de Ingesta Y 0 de Transaccion', async () => {
      // accountIdA fue poblado por el test de éxito de arriba (mismo describe
      // block, ejecutado antes en orden de archivo — fileParallelism: false).
      expect(accountIdA).toBeDefined();

      const nombreArchivo = `atomic-fail-${RUN_ID}.xlsx`;
      const txCountAntes = await prisma.transaccion.count({
        where: { accountId: accountIdA! },
      });

      // Cast DELIBERADO (mismo patrón que el W3 case retirado): evade el
      // invariante del dominio para probar la CHECK de Postgres como defensa
      // física de última línea sobre datos que llegan sin pasar por
      // `Transaccion.crear`.
      const txs: Transaccion[] = [
        Transaccion.crear({
          fecha: new Date('2026-05-14T00:00:00.000Z'),
          descripcion: 'ok',
          cargo: 100n,
          abono: 0n,
        }).getValue(),
        {
          fecha: new Date('2026-05-15T00:00:00.000Z'),
          descripcion: 'bad',
          cargo: -1n,
          abono: 0n,
        } as unknown as Transaccion,
      ];

      const result = await ingestaRepo.persistirProcesada({
        userId: USER_A,
        accountId: accountIdA!,
        banco: 'BCI',
        nombreArchivo,
        transacciones: txs,
        duplicadosOmitidos: 0,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PersistenciaFallidaError);

      // La escritura atómica es UN solo ingesta.create con createMany
      // anidado: la CHECK violation revierte el TRANSACTION completo,
      // incluyendo la fila padre Ingesta — no solo las Transaccion.
      const ingestaCount = await prisma.ingesta.count({
        where: { userId: USER_A, nombreArchivo },
      });
      expect(ingestaCount).toBe(0);

      // Ninguna Transaccion nueva quedó asociada a la cuenta — ni siquiera la
      // fila "ok" que hubiera sido válida por sí sola (rollback de TODO el
      // nested write, no solo de la fila que viola la CHECK).
      const txCountDespues = await prisma.transaccion.count({
        where: { accountId: accountIdA! },
      });
      expect(txCountDespues).toBe(txCountAntes);
    });
  });
});
