import 'dotenv/config';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';

import { PrismaConsentimientoRepository } from '../src/infrastructure/persistence/prisma-consentimiento.repository';
import { PrismaCuentaRepository } from '../src/infrastructure/persistence/prisma-cuenta.repository';
import {
  TipoConsentimiento,
  VersionConsentimiento,
} from '../src/domain/value-objects/consentimiento';

const version = (raw: string) => VersionConsentimiento.crear(raw).getValue();

describe('PrismaConsentimientoRepository (integración)', () => {
  const prisma = createPrismaClient(loadEnv());
  const repo = new PrismaConsentimientoRepository(prisma);
  const emails = ['consent-a@test.local', 'consent-b@test.local'];
  let userA: string;
  let userB: string;

  const limpiar = async () => {
    const usuarios = await prisma.user.findMany({
      where: { nombre: { in: emails } },
      select: { id: true },
    });
    const ids = usuarios.map((u) => u.id);
    await prisma.consentimiento.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  };

  beforeEach(async () => {
    await limpiar();
    userA = (await prisma.user.create({ data: { nombre: emails[0] } })).id;
    userB = (await prisma.user.create({ data: { nombre: emails[1] } })).id;
  });

  afterAll(async () => {
    await limpiar();
    await prisma.$disconnect();
  });

  it('acepta y queda vigente', async () => {
    const creado = await repo.aceptar(
      userA,
      TipoConsentimiento.Cartolas,
      version('1'),
    );

    expect(creado.tipo).toBe(TipoConsentimiento.Cartolas);
    expect(creado.version).toBe('1');
    expect(creado.aceptadoEn).toBeInstanceOf(Date);
    expect(creado.revocadoEn).toBeNull();
    expect(await repo.tieneVigente(userA, TipoConsentimiento.Cartolas)).toBe(
      true,
    );
  });

  it('aceptar la misma versión no crea otra fila', async () => {
    const primero = await repo.aceptar(
      userA,
      TipoConsentimiento.Cartolas,
      version('1'),
    );
    const segundo = await repo.aceptar(
      userA,
      TipoConsentimiento.Cartolas,
      version('1'),
    );

    expect(segundo.aceptadoEn).toEqual(primero.aceptadoEn);
    expect(await repo.listar(userA)).toHaveLength(1);
  });

  it('aceptar otra versión revoca la anterior y conserva el historial', async () => {
    await repo.aceptar(userA, TipoConsentimiento.Cartolas, version('1'));
    await repo.aceptar(userA, TipoConsentimiento.Cartolas, version('2'));

    const filas = await repo.listar(userA);

    expect(filas.map((f) => f.version)).toEqual(['2', '1']);
    expect(filas[0].revocadoEn).toBeNull();
    expect(filas[1].revocadoEn).toBeInstanceOf(Date);
  });

  it('dos aceptaciones concurrentes dejan una sola fila vigente', async () => {
    await Promise.all(
      Array.from({ length: 5 }, () =>
        repo.aceptar(userA, TipoConsentimiento.Cartolas, version('1')),
      ),
    );

    expect(await repo.listar(userA)).toHaveLength(1);
  });

  it('el índice parcial impide dos filas vigentes del mismo tipo', async () => {
    const fila = {
      userId: userA,
      tipo: TipoConsentimiento.Cartolas,
      version: '1',
    };
    await prisma.consentimiento.create({ data: fila });

    await expect(
      prisma.consentimiento.create({ data: fila }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('el CHECK rechaza un tipo desconocido', async () => {
    await expect(
      prisma.consentimiento.create({
        data: { userId: userA, tipo: 'otro', version: '1' },
      }),
    ).rejects.toThrow();
  });

  it('revocar deja de estar vigente y es idempotente', async () => {
    await repo.aceptar(userA, TipoConsentimiento.Cartolas, version('1'));

    await repo.revocar(userA, TipoConsentimiento.Cartolas);
    await repo.revocar(userA, TipoConsentimiento.Cartolas);

    expect(await repo.tieneVigente(userA, TipoConsentimiento.Cartolas)).toBe(
      false,
    );
    expect(await repo.listar(userA)).toHaveLength(1);
  });

  it('un usuario no ve ni revoca los consentimientos de otro (RNF-SEC-006)', async () => {
    await repo.aceptar(userA, TipoConsentimiento.Cartolas, version('1'));

    await repo.revocar(userB, TipoConsentimiento.Cartolas);

    expect(await repo.listar(userB)).toEqual([]);
    expect(await repo.tieneVigente(userB, TipoConsentimiento.Cartolas)).toBe(
      false,
    );
    expect(await repo.tieneVigente(userA, TipoConsentimiento.Cartolas)).toBe(
      true,
    );
  });

  it('borrar la cuenta borra sus consentimientos y no los de otro', async () => {
    await repo.aceptar(userA, TipoConsentimiento.Cartolas, version('1'));
    await repo.aceptar(userB, TipoConsentimiento.Cartolas, version('1'));

    await new PrismaCuentaRepository(prisma).eliminar(userA);

    expect(
      await prisma.consentimiento.count({ where: { userId: userA } }),
    ).toBe(0);
    expect(await repo.listar(userB)).toHaveLength(1);
  });
});
