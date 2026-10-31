import 'dotenv/config';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { deriveBlindIndexKey } from '../src/composition/derive-blind-index-key';
import { Email } from '../src/domain/value-objects/email';
import { AesGcmCryptoService } from '../src/infrastructure/persistence/aes-gcm-crypto.service';
import { HmacBlindIndexService } from '../src/infrastructure/persistence/hmac-blind-index.service';

import { PrismaConsentimientoRepository } from '../src/infrastructure/persistence/prisma-consentimiento.repository';
import { PrismaIdentidadAppleRepository } from '../src/infrastructure/persistence/prisma-identidad-apple.repository';
import { PrismaIdentidadGoogleRepository } from '../src/infrastructure/persistence/prisma-identidad-google.repository';
import { PrismaCuentaRepository } from '../src/infrastructure/persistence/prisma-cuenta.repository';
import {
  aceptacionTerminos,
  TipoConsentimiento,
  VersionConsentimiento,
} from '../src/domain/value-objects/consentimiento';

const version = (raw: string) => VersionConsentimiento.crear(raw).getValue();

describe('PrismaConsentimientoRepository (integración)', () => {
  const env = loadEnv();
  const prisma = createPrismaClient(env);
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

  describe('alta con términos aceptados (AUTH-03)', () => {
    const crypto = new AesGcmCryptoService(
      Buffer.from(env.ENCRYPTION_KEY, 'base64'),
    );
    const blindIndex = new HmacBlindIndexService(
      deriveBlindIndexKey(Buffer.from(env.ENCRYPTION_KEY, 'base64')),
    );
    const aceptacion = aceptacionTerminos({
      terminos: '2026-10',
      privacidad: '2026-09',
    }).getValue();
    const email = Email.crear('consent-alta@test.local').getValue();
    const SUB = 'consent-alta-sub';

    const borrarAltas = async () => {
      const altas = await prisma.user.findMany({
        where: { OR: [{ appleSub: SUB }, { googleSub: SUB }] },
        select: { id: true },
      });
      const cuentas = new PrismaCuentaRepository(prisma);
      await Promise.all(altas.map((u) => cuentas.eliminar(u.id)));
    };

    beforeEach(borrarAltas);
    afterAll(borrarAltas);

    const tiposDe = async (userId: string) =>
      (await repo.listar(userId)).map((c) => `${c.tipo}:${c.version}`).sort();

    it('Apple guarda términos y privacidad con la cuenta', async () => {
      const userId = await new PrismaIdentidadAppleRepository(
        prisma,
        blindIndex,
        crypto,
      ).crearDesdeApple({ email, appleSub: SUB, nombre: 'Ana', aceptacion });

      expect(await tiposDe(userId!)).toEqual([
        'privacidad:2026-09',
        'terminos:2026-10',
      ]);
    });

    it('Google guarda términos y privacidad con la cuenta', async () => {
      const userId = await new PrismaIdentidadGoogleRepository(
        prisma,
        blindIndex,
        crypto,
      ).crearDesdeGoogle({ email, googleSub: SUB, nombre: 'Ana', aceptacion });

      expect(await tiposDe(userId!)).toEqual([
        'privacidad:2026-09',
        'terminos:2026-10',
      ]);
    });

    it('sin aceptación crea la cuenta sin registros', async () => {
      const userId = await new PrismaIdentidadGoogleRepository(
        prisma,
        blindIndex,
        crypto,
      ).crearDesdeGoogle({
        email,
        googleSub: SUB,
        nombre: 'Ana',
        aceptacion: null,
      });

      expect(await repo.listar(userId!)).toEqual([]);
    });
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
