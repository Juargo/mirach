import 'dotenv/config';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { PrismaDerechosPlusWriter } from '../src/infrastructure/persistence/prisma-derechos-plus.writer';
import type { CambioDerechosAplicable } from '../src/application/ports/derechos-plus-writer.port';
import {
  EstadoSuscripcion,
  TiendaSuscripcion,
} from '../src/domain/value-objects/plan';

const RUN_ID = `derechos-int-${Date.now()}`;
const T0 = new Date('2026-12-10T12:00:00.000Z');
const T1 = new Date('2026-12-11T12:00:00.000Z');
const T2 = new Date('2026-12-12T12:00:00.000Z');
const VENCE = new Date('2027-01-10T12:00:00.000Z');

describe('PrismaDerechosPlusWriter (integración)', () => {
  const prisma = createPrismaClient(loadEnv());
  const writer = new PrismaDerechosPlusWriter(prisma);
  const [ana, beto] = [`${RUN_ID}-ana`, `${RUN_ID}-beto`];
  const usuarios = [ana, beto];
  const cuenta = { where: { userId: { in: usuarios } } };
  let secuencia = 0;
  const eventoId = () => `${RUN_ID}-evt-${++secuencia}`;

  const suscripcion = (
    cambios: Partial<{
      usuarios: string[];
      estado: EstadoSuscripcion;
      venceEn: Date;
      ocurridoEn: Date;
      producto: string;
    }> = {},
  ): CambioDerechosAplicable => ({
    tipo: 'suscripcion',
    usuarios: cambios.usuarios ?? [ana],
    suscripcion: {
      estado: cambios.estado ?? EstadoSuscripcion.Activa,
      producto: cambios.producto ?? 'plus_mensual',
      tienda: TiendaSuscripcion.AppStore,
      venceEn: cambios.venceEn ?? VENCE,
    },
    ocurridoEn: cambios.ocurridoEn ?? T0,
  });

  const fundador = (
    tipo: 'fundador_otorgado' | 'fundador_revocado',
    ocurridoEn: Date,
    usuario = ana,
    sandbox = false,
  ): CambioDerechosAplicable =>
    tipo === 'fundador_otorgado'
      ? { tipo, usuarios: [usuario], ocurridoEn, sandbox }
      : { tipo, usuarios: [usuario], ocurridoEn };

  const leerSuscripcion = (userId: string) =>
    prisma.suscripcion.findUnique({ where: { userId } });
  const leerFundador = (userId: string) =>
    prisma.permisoPlan.findUnique({
      where: { userId_motivo: { userId, motivo: 'fundador' } },
    });

  const limpiar = async () => {
    await prisma.suscripcion.deleteMany(cuenta);
    await prisma.permisoPlan.deleteMany(cuenta);
    await prisma.eventoSuscripcionProcesado.deleteMany({
      where: { id: { startsWith: RUN_ID } },
    });
  };

  beforeAll(async () => {
    for (const id of usuarios) {
      await prisma.user.create({ data: { id, nombre: id } });
    }
  });

  beforeEach(limpiar);

  afterAll(async () => {
    await limpiar();
    await prisma.user.deleteMany({ where: { id: { in: usuarios } } });
    await prisma.$disconnect();
  });

  describe('suscripción', () => {
    it('crea la suscripción del usuario', async () => {
      expect(await writer.aplicar(eventoId(), suscripcion())).toBe('aplicado');

      expect(await leerSuscripcion(ana)).toMatchObject({
        userId: ana,
        producto: 'plus_mensual',
        estado: 'activa',
        tienda: 'app_store',
        venceEn: VENCE,
        ultimoEventoEn: T0,
      });
      expect(await leerSuscripcion(beto)).toBeNull();
    });

    it('un evento posterior actualiza la misma fila', async () => {
      await writer.aplicar(eventoId(), suscripcion());

      const resultado = await writer.aplicar(
        eventoId(),
        suscripcion({
          estado: EstadoSuscripcion.Cancelada,
          producto: 'plus_anual',
          ocurridoEn: T1,
        }),
      );

      expect(resultado).toBe('aplicado');
      expect(await prisma.suscripcion.count(cuenta)).toBe(1);
      expect(await leerSuscripcion(ana)).toMatchObject({
        estado: 'cancelada',
        producto: 'plus_anual',
        ultimoEventoEn: T1,
      });
    });

    it('el mismo evento entregado dos veces se aplica una sola vez', async () => {
      const id = eventoId();
      await writer.aplicar(id, suscripcion());
      await prisma.suscripcion.update({
        where: { userId: ana },
        data: { estado: 'vencida' },
      });

      expect(await writer.aplicar(id, suscripcion())).toBe('duplicado');
      expect((await leerSuscripcion(ana))?.estado).toBe('vencida');
    });

    it('un evento más antiguo que el último aplicado no cambia nada', async () => {
      await writer.aplicar(
        eventoId(),
        suscripcion({ estado: EstadoSuscripcion.Vencida, ocurridoEn: T1 }),
      );
      const atrasado = eventoId();

      const resultado = await writer.aplicar(
        atrasado,
        suscripcion({ ocurridoEn: T0 }),
      );

      expect(resultado).toBe('obsoleto');
      expect(await leerSuscripcion(ana)).toMatchObject({
        estado: 'vencida',
        ultimoEventoEn: T1,
      });
      // It is recorded too: a redelivery answers `duplicado`.
      expect(await writer.aplicar(atrasado, suscripcion())).toBe('duplicado');
    });

    it('aplica al primer usuario del evento que existe', async () => {
      const resultado = await writer.aplicar(
        eventoId(),
        suscripcion({ usuarios: [`${RUN_ID}-borrado`, beto, ana] }),
      );

      expect(resultado).toBe('aplicado');
      expect(await leerSuscripcion(beto)).not.toBeNull();
      expect(await leerSuscripcion(ana)).toBeNull();
    });

    it('sin ningún usuario existente no escribe nada ni registra el evento', async () => {
      const id = eventoId();

      const resultado = await writer.aplicar(
        id,
        suscripcion({ usuarios: [`${RUN_ID}-borrado`] }),
      );

      expect(resultado).toBe('usuario_desconocido');
      expect(await prisma.suscripcion.count(cuenta)).toBe(0);
      expect(
        await prisma.eventoSuscripcionProcesado.count({ where: { id } }),
      ).toBe(0);
    });
  });

  describe('plan Fundador', () => {
    it('otorga un permiso sin vencimiento', async () => {
      const resultado = await writer.aplicar(
        eventoId(),
        fundador('fundador_otorgado', T0),
      );

      expect(resultado).toBe('aplicado');
      expect(await leerFundador(ana)).toMatchObject({
        otorgadoEn: T0,
        venceEn: null,
        revocadoEn: null,
      });
    });

    it('guarda si la compra fue de sandbox, y una compra real posterior la reemplaza', async () => {
      await writer.aplicar(
        eventoId(),
        fundador('fundador_otorgado', T0, ana, true),
      );
      expect((await leerFundador(ana))?.sandbox).toBe(true);

      await writer.aplicar(eventoId(), fundador('fundador_revocado', T1));
      await writer.aplicar(eventoId(), fundador('fundador_otorgado', T2));

      expect(await leerFundador(ana)).toMatchObject({
        sandbox: false,
        revocadoEn: null,
      });
    });

    it('una compra real no marca sandbox', async () => {
      await writer.aplicar(eventoId(), fundador('fundador_otorgado', T0));

      expect((await leerFundador(ana))?.sandbox).toBe(false);
    });

    it('un reembolso lo revoca sin borrar la fila', async () => {
      await writer.aplicar(eventoId(), fundador('fundador_otorgado', T0));

      const resultado = await writer.aplicar(
        eventoId(),
        fundador('fundador_revocado', T1),
      );

      expect(resultado).toBe('aplicado');
      expect(await leerFundador(ana)).toMatchObject({
        otorgadoEn: T0,
        revocadoEn: T1,
      });
    });

    it('volver a otorgarlo después de un reembolso lo deja vigente', async () => {
      await writer.aplicar(eventoId(), fundador('fundador_otorgado', T0));
      await writer.aplicar(eventoId(), fundador('fundador_revocado', T1));

      await writer.aplicar(eventoId(), fundador('fundador_otorgado', T2));

      expect(await leerFundador(ana)).toMatchObject({
        otorgadoEn: T2,
        revocadoEn: null,
      });
      expect(await prisma.permisoPlan.count(cuenta)).toBe(1);
    });

    it('una compra que llega después de su reembolso, pero es anterior, no lo revive', async () => {
      await writer.aplicar(eventoId(), fundador('fundador_revocado', T1));

      const resultado = await writer.aplicar(
        eventoId(),
        fundador('fundador_otorgado', T0),
      );

      expect(resultado).toBe('obsoleto');
      expect((await leerFundador(ana))?.revocadoEn).toEqual(T1);
    });

    it('un reembolso anterior a la compra vigente no la revoca', async () => {
      await writer.aplicar(eventoId(), fundador('fundador_otorgado', T1));

      const resultado = await writer.aplicar(
        eventoId(),
        fundador('fundador_revocado', T0),
      );

      expect(resultado).toBe('obsoleto');
      expect((await leerFundador(ana))?.revocadoEn).toBeNull();
    });

    it('no toca los otros permisos del usuario ni los de otro usuario', async () => {
      await prisma.permisoPlan.createMany({
        data: [
          { userId: ana, motivo: 'prueba', venceEn: VENCE },
          { userId: beto, motivo: 'fundador' },
        ],
      });
      await writer.aplicar(eventoId(), fundador('fundador_otorgado', T0));

      await writer.aplicar(eventoId(), fundador('fundador_revocado', T1));

      expect(
        await prisma.permisoPlan.findUnique({
          where: { userId_motivo: { userId: ana, motivo: 'prueba' } },
        }),
      ).toMatchObject({ venceEn: VENCE, revocadoEn: null });
      expect((await leerFundador(beto))?.revocadoEn).toBeNull();
    });
  });

  describe('transferencia', () => {
    const transferir = (desde: string[], hacia: string[], ocurridoEn = T1) =>
      writer.aplicar(eventoId(), {
        tipo: 'transferencia',
        desde,
        hacia,
        ocurridoEn,
      });

    it('mueve la suscripción y el Fundador al destino', async () => {
      await writer.aplicar(eventoId(), suscripcion());
      await writer.aplicar(eventoId(), fundador('fundador_otorgado', T0));

      expect(await transferir([ana], [beto])).toBe('aplicado');

      expect(await leerSuscripcion(ana)).toBeNull();
      expect(await leerSuscripcion(beto)).toMatchObject({
        estado: 'activa',
        ultimoEventoEn: T1,
      });
      expect(await leerFundador(ana)).toBeNull();
      expect((await leerFundador(beto))?.revocadoEn).toBeNull();
    });

    it('la prueba y el vitalicio de tester no se transfieren: son de la cuenta', async () => {
      await prisma.permisoPlan.createMany({
        data: [
          { userId: ana, motivo: 'prueba', venceEn: VENCE },
          { userId: ana, motivo: 'tester_vitalicio' },
        ],
      });
      await writer.aplicar(eventoId(), suscripcion());

      await transferir([ana], [beto]);

      expect(await prisma.permisoPlan.count({ where: { userId: ana } })).toBe(
        2,
      );
      expect(await prisma.permisoPlan.count({ where: { userId: beto } })).toBe(
        0,
      );
    });

    it('si el destino ya tiene los suyos, el origen igual los pierde', async () => {
      await writer.aplicar(eventoId(), suscripcion());
      await writer.aplicar(eventoId(), fundador('fundador_otorgado', T0));
      await writer.aplicar(
        eventoId(),
        suscripcion({ usuarios: [beto], producto: 'plus_anual' }),
      );
      await writer.aplicar(eventoId(), fundador('fundador_otorgado', T0, beto));

      expect(await transferir([ana], [beto])).toBe('aplicado');

      expect(await leerSuscripcion(beto)).toMatchObject({
        producto: 'plus_anual',
        estado: 'activa',
      });
      expect(await leerSuscripcion(ana)).toMatchObject({
        estado: 'vencida',
        venceEn: T1,
        ultimoEventoEn: T1,
      });
      expect((await leerFundador(beto))?.revocadoEn).toBeNull();
      expect((await leerFundador(ana))?.revocadoEn).toEqual(T1);
    });

    it('una suscripción vencida del destino se reemplaza por la vigente del origen', async () => {
      await writer.aplicar(eventoId(), suscripcion({ producto: 'plus_anual' }));
      await writer.aplicar(
        eventoId(),
        suscripcion({
          usuarios: [beto],
          estado: EstadoSuscripcion.Vencida,
          venceEn: T0,
        }),
      );

      await transferir([ana], [beto]);

      expect(await leerSuscripcion(beto)).toMatchObject({
        producto: 'plus_anual',
        estado: 'activa',
        venceEn: VENCE,
        ultimoEventoEn: T1,
      });
      expect(await leerSuscripcion(ana)).toBeNull();
    });

    it('un Fundador revocado del destino vuelve a valer con el del origen', async () => {
      await writer.aplicar(eventoId(), fundador('fundador_otorgado', T0));
      await writer.aplicar(eventoId(), fundador('fundador_revocado', T0, beto));

      await transferir([ana], [beto]);

      expect(await leerFundador(beto)).toMatchObject({
        otorgadoEn: T1,
        revocadoEn: null,
      });
      expect((await leerFundador(ana))?.revocadoEn).toEqual(T1);
      expect(
        await prisma.permisoPlan.count({
          where: { ...cuenta.where, motivo: 'fundador', revocadoEn: null },
        }),
      ).toBe(1);
    });

    it('sin destino existente no cambia nada', async () => {
      await writer.aplicar(eventoId(), suscripcion());

      expect(await transferir([ana], [`${RUN_ID}-borrado`])).toBe(
        'usuario_desconocido',
      );
      expect(await leerSuscripcion(ana)).not.toBeNull();
    });

    it('sin origen existente avisa que no hubo qué mover', async () => {
      expect(await transferir([`${RUN_ID}-borrado`], [beto])).toBe(
        'usuario_desconocido',
      );
    });

    it('una transferencia a la misma cuenta no cambia nada', async () => {
      await writer.aplicar(eventoId(), suscripcion());

      expect(await transferir([ana], [ana])).toBe('usuario_desconocido');
      expect((await leerSuscripcion(ana))?.estado).toBe('activa');
    });
  });
});
