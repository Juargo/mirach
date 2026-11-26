import 'dotenv/config';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { deriveBlindIndexKey } from '../src/composition/derive-blind-index-key';
import { HmacBlindIndexService } from '../src/infrastructure/persistence/hmac-blind-index.service';
import { runConcederPlusVitalicio } from '../prisma/conceder-plus-vitalicio';

const RUN_ID = `vitalicio-int-${Date.now()}`;

describe('runConcederPlusVitalicio (integración, PLA-11)', () => {
  const env = loadEnv();
  const prisma = createPrismaClient(env);
  const blindIndex = new HmacBlindIndexService(
    deriveBlindIndexKey(Buffer.from(env.ENCRYPTION_KEY, 'base64')),
  );
  const correo = (nombre: string) => `${RUN_ID}-${nombre}@test.local`;
  const ids: string[] = [];

  const crear = async (
    nombre: string,
    identidad: { googleSub?: string; appleSub?: string } = {},
  ) => {
    const id = `${RUN_ID}-${nombre}`;
    await prisma.user.create({
      data: {
        id,
        nombre: id,
        emailBlindIndex: blindIndex.compute(correo(nombre)),
        ...identidad,
      },
    });
    ids.push(id);
    return id;
  };

  const permisos = (userId: string) =>
    prisma.permisoPlan.findMany({ where: { userId } });
  const conceder = (...emails: string[]) =>
    runConcederPlusVitalicio(prisma, emails, { blindIndex });

  afterEach(async () => {
    await prisma.permisoPlan.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    ids.length = 0;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('concede Plus sin vencimiento a la cuenta de Google del tester', async () => {
    const tester = await crear('ana', { googleSub: `${RUN_ID}-g-ana` });
    const otro = await crear('beto', { googleSub: `${RUN_ID}-g-beto` });

    expect(await conceder(correo('ana'))).toEqual(['concedido']);

    expect(await permisos(tester)).toMatchObject([
      { motivo: 'tester_vitalicio', venceEn: null, revocadoEn: null },
    ]);
    expect(await permisos(otro)).toEqual([]);
  });

  it('acepta una cuenta de Apple y normaliza el email', async () => {
    const tester = await crear('carla', { appleSub: `${RUN_ID}-a-carla` });

    const resultado = await conceder(`  ${correo('carla').toUpperCase()} `);

    expect(resultado).toEqual(['concedido']);
    expect(await permisos(tester)).toHaveLength(1);
  });

  it('es idempotente: correrlo de nuevo no duplica ni cambia la fecha', async () => {
    const tester = await crear('ana', { googleSub: `${RUN_ID}-g-ana` });
    await conceder(correo('ana'));
    const [primero] = await permisos(tester);

    expect(await conceder(correo('ana'))).toEqual(['ya_lo_tenia']);

    expect(await permisos(tester)).toEqual([primero]);
  });

  it('vuelve a conceder un permiso que estaba revocado', async () => {
    const tester = await crear('ana', { googleSub: `${RUN_ID}-g-ana` });
    await prisma.permisoPlan.create({
      data: {
        userId: tester,
        motivo: 'tester_vitalicio',
        revocadoEn: new Date(),
      },
    });

    expect(await conceder(correo('ana'))).toEqual(['concedido']);
    expect(await permisos(tester)).toMatchObject([{ revocadoEn: null }]);
  });

  it('no concede a un email sin cuenta, y sigue con los demás', async () => {
    const tester = await crear('ana', { googleSub: `${RUN_ID}-g-ana` });

    const resultado = await conceder(correo('nadie'), correo('ana'));

    expect(resultado).toEqual(['no_encontrado', 'concedido']);
    expect(await permisos(tester)).toHaveLength(1);
  });

  it('no concede a una cuenta sin Apple ni Google', async () => {
    const sinIdentidad = await crear('dario');

    expect(await conceder(correo('dario'))).toEqual(['sin_identidad']);
    expect(await permisos(sinIdentidad)).toEqual([]);
  });

  it('rechaza un email mal escrito sin escribir nada', async () => {
    const tester = await crear('ana', { googleSub: `${RUN_ID}-g-ana` });

    const resultado = await conceder('no-es-un-email', correo('ana'));

    expect(resultado).toEqual(['email_invalido', 'concedido']);
    expect(await permisos(tester)).toHaveLength(1);
  });
});
