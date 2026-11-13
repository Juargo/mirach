import type { PrismaClient } from '@prisma/client';

import { PrismaFusionCuentasRepository } from './prisma-fusion-cuentas.repository';
import type { ICryptoService } from '../../application/ports/crypto-service.port';

/**
 * Unit tests for PrismaFusionCuentasRepository — mocked Prisma client. The
 * real constraints (RESTRICT, SET NULL, the composite FK, the locks) are
 * covered by `test/fusion-cuentas.int-spec.ts`.
 */
const crypto: ICryptoService = {
  // Cifrado con IV aleatorio: el mismo texto cifra distinto cada vez.
  encrypt: (v) => `enc0:${v}`,
  decrypt: (v) => v.replace(/^enc\d+:/, ''),
};

const ORIGEN = 'u-origen';
const DESTINO = 'u-destino';

interface Escenario {
  usuariosBloqueados?: Array<{ id: string }>;
  origenAnonimo?: boolean;
  destinoExiste?: boolean;
  cuentasOrigen?: unknown[];
  cuentasDestino?: unknown[];
  movimientos?: Record<string, unknown[]>;
  categoriasOrigen?: unknown[];
  categoriasDestino?: unknown[];
  patronesOrigen?: unknown[];
  patronesDestino?: unknown[];
  movimientosEnCuentasMovidas?: number;
}

const ESCRITURAS = [
  'transaccion.deleteMany',
  'transaccion.updateMany',
  'ingesta.updateMany',
  'account.deleteMany',
  'account.updateMany',
  'patronClasificacion.deleteMany',
  'patronClasificacion.updateMany',
  'categoria.updateMany',
  'categoria.deleteMany',
  'session.deleteMany',
  'consentimiento.deleteMany',
  'user.delete',
] as const;

function montar(e: Escenario = {}) {
  /** Orden global de todas las llamadas, para comprobar el orden de escritura. */
  const orden: string[] = [];
  const registrar = <T>(nombre: string, valor: T) =>
    vi.fn((..._args: unknown[]) => {
      orden.push(nombre);
      return Promise.resolve(valor);
    });
  const porUsuario =
    (origen: unknown[] | undefined, destino: unknown[] | undefined) =>
    (args: { where: { userId: string } }) =>
      Promise.resolve(args.where.userId === ORIGEN ? origen : destino);

  const tx = {
    $queryRaw: vi.fn((sql: { values: unknown[] }) => {
      const id = String(sql.values[0]);
      orden.push(`lock:${id}`);
      return Promise.resolve(
        e.usuariosBloqueados === undefined ? [{ id }] : e.usuariosBloqueados,
      );
    }),
    user: {
      findFirst: vi.fn(() =>
        Promise.resolve(e.origenAnonimo === false ? null : { id: ORIGEN }),
      ),
      findUnique: vi.fn(() =>
        Promise.resolve(e.destinoExiste === false ? null : { id: DESTINO }),
      ),
      delete: registrar('user.delete', {}),
    },
    account: {
      findMany: vi.fn(
        porUsuario(e.cuentasOrigen ?? [], e.cuentasDestino ?? []),
      ),
      deleteMany: registrar('account.deleteMany', { count: 1 }),
      updateMany: registrar('account.updateMany', { count: 1 }),
    },
    transaccion: {
      findMany: vi.fn((args: { where: { accountId: string } }) =>
        Promise.resolve(e.movimientos?.[args.where.accountId] ?? []),
      ),
      count: vi.fn(() => Promise.resolve(e.movimientosEnCuentasMovidas ?? 0)),
      deleteMany: registrar('transaccion.deleteMany', { count: 0 }),
      updateMany: registrar('transaccion.updateMany', { count: 0 }),
    },
    ingesta: { updateMany: registrar('ingesta.updateMany', { count: 0 }) },
    categoria: {
      findMany: vi.fn(
        porUsuario(e.categoriasOrigen ?? [], e.categoriasDestino ?? []),
      ),
      updateMany: registrar('categoria.updateMany', { count: 0 }),
      deleteMany: registrar('categoria.deleteMany', { count: 0 }),
    },
    patronClasificacion: {
      findMany: vi.fn(
        porUsuario(e.patronesOrigen ?? [], e.patronesDestino ?? []),
      ),
      deleteMany: registrar('patronClasificacion.deleteMany', { count: 0 }),
      updateMany: registrar('patronClasificacion.updateMany', { count: 0 }),
    },
    session: { deleteMany: registrar('session.deleteMany', { count: 1 }) },
    consentimiento: {
      deleteMany: registrar('consentimiento.deleteMany', { count: 2 }),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(tx)),
  };
  const repo = new PrismaFusionCuentasRepository(
    prisma as unknown as PrismaClient,
    crypto,
  );

  return { repo, tx, prisma, orden };
}

function sinEscrituras(orden: string[]) {
  expect(orden.filter((o) => ESCRITURAS.some((w) => o === w))).toEqual([]);
}

const cuenta = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  banco: 'BCI',
  tipoCuenta: 'corriente',
  numeroCuentaBlindIndex: 'bi-1',
  ...over,
});

const movimiento = (id: string, descripcion: string, over = {}) => ({
  id,
  fecha: new Date('2026-10-12'),
  descripcion,
  cargo: 3500n,
  abono: 0n,
  ...over,
});

describe('PrismaFusionCuentasRepository.fusionar', () => {
  it('bloquea los dos usuarios en orden de id, dentro de una sola transacción', async () => {
    const { repo, prisma, orden } = montar();

    await repo.fusionar('z-origen', 'a-destino');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(orden.slice(0, 2)).toEqual(['lock:a-destino', 'lock:z-origen']);
  });

  it.each([
    ['el origen dejó de ser anónimo', { origenAnonimo: false }],
    ['el destino no existe', { destinoExiste: false }],
    ['el bloqueo no encuentra la fila', { usuariosBloqueados: [] }],
  ])('%s: devuelve null y no escribe nada', async (_n, escenario) => {
    const { repo, orden, tx } = montar(escenario);

    const r = await repo.fusionar(ORIGEN, DESTINO);

    expect(r).toBeNull();
    sinEscrituras(orden);
    expect(tx.account.findMany).not.toHaveBeenCalled();
  });

  it('la comprobación del origen exige las tres credenciales nulas y el id del origen', async () => {
    const { repo, tx } = montar();

    await repo.fusionar(ORIGEN, DESTINO);

    expect(tx.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: ORIGEN,
        appleSub: null,
        googleSub: null,
        passwordHash: null,
      },
      select: { id: true },
    });
  });

  it('une cuentas, descarta duplicados descifrando y mueve el resto; todo con userId en el WHERE', async () => {
    const { repo, tx } = montar({
      cuentasOrigen: [cuenta('ao-1'), cuenta('ao-2', { banco: 'Santander' })],
      cuentasDestino: [cuenta('ad-1')],
      movimientos: {
        // Mismo texto, IV distinto: solo se detecta descifrando.
        'ad-1': [movimiento('md-1', 'enc7:COPEC')],
        'ao-1': [
          movimiento('mo-1', 'enc3:COPEC'),
          movimiento('mo-2', 'enc4:LIDER'),
        ],
      },
      movimientosEnCuentasMovidas: 5,
    });

    const r = await repo.fusionar(ORIGEN, DESTINO);

    expect(r).toEqual({
      cuentasMovidas: 1,
      cuentasUnidas: 1,
      movimientosMovidos: 1 + 5,
      duplicadosOmitidos: 1,
      categoriasMovidas: 0,
      patronesMovidos: 0,
    });
    expect(tx.transaccion.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['mo-1'] },
        accountId: 'ao-1',
        account: { userId: ORIGEN },
      },
    });
    expect(tx.transaccion.updateMany).toHaveBeenCalledWith({
      where: { accountId: 'ao-1', account: { userId: ORIGEN } },
      data: { accountId: 'ad-1' },
    });
    expect(tx.ingesta.updateMany).toHaveBeenCalledWith({
      where: { userId: ORIGEN, accountId: 'ao-1' },
      data: { userId: DESTINO, accountId: 'ad-1' },
    });
    expect(tx.account.deleteMany).toHaveBeenCalledWith({
      where: { id: 'ao-1', userId: ORIGEN },
    });
    expect(tx.account.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['ao-2'] }, userId: ORIGEN },
      data: { userId: DESTINO },
    });
    expect(tx.transaccion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountId: 'ao-1', account: { userId: ORIGEN } },
      }),
    );
    expect(tx.transaccion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountId: 'ad-1', account: { userId: DESTINO } },
      }),
    );
  });

  it('reapunta movimientos y patrones ANTES de borrar categorías, y borra solo las reemplazadas', async () => {
    const { repo, tx, orden } = montar({
      categoriasOrigen: [
        { id: 'co-1', bucketId: 'b-nec', nombre: 'Supermercado' },
        { id: 'co-2', bucketId: 'b-des', nombre: 'Mascotas' },
      ],
      categoriasDestino: [
        { id: 'cd-1', bucketId: 'b-nec', nombre: 'Supermercado' },
      ],
      patronesOrigen: [
        { id: 'po-1', patron: 'CAFE', categoriaId: 'co-1' },
        { id: 'po-2', patron: 'jumbo', categoriaId: 'co-1' },
        { id: 'po-3', patron: 'guau', categoriaId: 'co-2' },
      ],
      patronesDestino: [{ id: 'pd-1', patron: 'Café', categoriaId: 'cd-1' }],
    });

    const r = await repo.fusionar(ORIGEN, DESTINO);

    expect(r).toMatchObject({ categoriasMovidas: 1, patronesMovidos: 2 });
    expect(tx.patronClasificacion.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['po-1'] }, userId: ORIGEN },
    });
    expect(tx.transaccion.updateMany).toHaveBeenCalledWith({
      where: { categoriaId: 'co-1', account: { userId: DESTINO } },
      data: { categoriaId: 'cd-1' },
    });
    // categoriaId y userId juntos: la FK compuesta (categoriaId, userId).
    expect(tx.patronClasificacion.updateMany).toHaveBeenCalledWith({
      where: { categoriaId: 'co-1', userId: ORIGEN },
      data: { categoriaId: 'cd-1', userId: DESTINO },
    });
    expect(tx.categoria.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['co-2'] }, userId: ORIGEN },
      data: { userId: DESTINO },
    });
    expect(tx.categoria.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['co-1'] }, userId: ORIGEN },
    });

    const borrarCategorias = orden.indexOf('categoria.deleteMany');
    expect(orden.indexOf('transaccion.updateMany')).toBeLessThan(
      borrarCategorias,
    );
    expect(orden.indexOf('patronClasificacion.updateMany')).toBeLessThan(
      borrarCategorias,
    );
    expect(orden.indexOf('patronClasificacion.deleteMany')).toBeLessThan(
      borrarCategorias,
    );
  });

  it('borra las sesiones, los consentimientos y el usuario del origen, y nada del destino', async () => {
    const { repo, tx, orden } = montar();

    await repo.fusionar(ORIGEN, DESTINO);

    expect(tx.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: ORIGEN },
    });
    expect(tx.consentimiento.deleteMany).toHaveBeenCalledWith({
      where: { userId: ORIGEN },
    });
    expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: ORIGEN } });
    expect(orden[orden.length - 1]).toBe('user.delete');
  });

  it('si una escritura falla, el error sale y la transacción lo revierte (no se traga)', async () => {
    const { repo, tx } = montar();
    tx.user.delete.mockRejectedValueOnce(new Error('FK'));

    await expect(repo.fusionar(ORIGEN, DESTINO)).rejects.toThrow('FK');
  });
});
