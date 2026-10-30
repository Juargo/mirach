/**
 * perfil-presupuesto.int-spec.ts — issue #110 (PER-03..PER-06, ADR-004 §8).
 *
 * PrismaPerfilPresupuestoRepository against a real DB: the 50/30/20 default
 * for a user who never chose a profile, save and read back, per-user
 * isolation (RNF-SEC-006), and the CHECK constraints of the
 * add_perfil_presupuesto migration.
 *
 * Requires a real DB. Run via
 * `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration -- perfil-presupuesto`.
 */
import 'dotenv/config';
import type { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { PrismaPerfilPresupuestoRepository } from '../src/infrastructure/persistence/prisma-perfil-presupuesto.repository';
import { PerfilPresupuesto } from '../src/domain/value-objects/perfil-presupuesto';
import { Bucket } from '../src/domain/value-objects/bucket';
import { MesFinanciero } from '../src/domain/value-objects/mes-financiero';

const ALLOW = process.env.ALLOW_DESTRUCTIVE_DB === '1';
const RUN_ID = `perfil-presupuesto-int-${Date.now()}`;

describe('PrismaPerfilPresupuestoRepository (#110)', () => {
  let prisma: PrismaClient;
  let repo: PrismaPerfilPresupuestoRepository;
  let userIdA: string;
  let userIdB: string;

  beforeAll(async () => {
    if (!ALLOW) return;
    prisma = createPrismaClient(loadEnv());
    await prisma.$connect();
    repo = new PrismaPerfilPresupuestoRepository(prisma);
    userIdA = (await prisma.user.create({ data: { nombre: `A ${RUN_ID}` } }))
      .id;
    userIdB = (await prisma.user.create({ data: { nombre: `B ${RUN_ID}` } }))
      .id;
  });

  afterAll(async () => {
    if (!ALLOW) return;
    await prisma.user.deleteMany({ where: { id: { in: [userIdA, userIdB] } } });
    await prisma.$disconnect();
  });

  it('a user who never chose a profile reads 50/30/20', async () => {
    if (!ALLOW) return;
    const perfil = await repo.obtener(userIdB);
    expect(perfil.perfil).toBe('50_30_20');
    expect(perfil.metas).toEqual(PerfilPresupuesto.porDefecto().metas);
  });

  it('an unknown user id reads the default instead of failing', async () => {
    if (!ALLOW) return;
    const perfil = await repo.obtener(`no-existe-${RUN_ID}`);
    expect(perfil.perfil).toBe('50_30_20');
  });

  it('saves a predefined profile and reads it back', async () => {
    if (!ALLOW) return;
    await repo.guardar(userIdA, PerfilPresupuesto.predefinido('80_10_10'));
    const perfil = await repo.obtener(userIdA);
    expect(perfil.perfil).toBe('80_10_10');
    expect(perfil.metas[Bucket.Necesidades]).toBe(8000n);
  });

  it('saves a custom profile and reads it back', async () => {
    if (!ALLOW) return;
    const custom = PerfilPresupuesto.personalizado({
      [Bucket.Necesidades]: 5500n,
      [Bucket.Deseos]: 2500n,
      [Bucket.Ahorro]: 2000n,
    }).getValue();
    await repo.guardar(userIdA, custom);
    const perfil = await repo.obtener(userIdA);
    expect(perfil.perfil).toBe('personalizado');
    expect(perfil.metas).toEqual(custom.metas);
  });

  it('saving A leaves B untouched (isolation, RNF-SEC-006)', async () => {
    if (!ALLOW) return;
    await repo.guardar(userIdA, PerfilPresupuesto.predefinido('70_15_15'));
    const filaB = await prisma.user.findUniqueOrThrow({
      where: { id: userIdB },
      select: {
        perfilPresupuesto: true,
        metaNecesidadesBp: true,
        metaDeseosBp: true,
        metaAhorroBp: true,
      },
    });
    expect(filaB).toEqual({
      perfilPresupuesto: '50_30_20',
      metaNecesidadesBp: 5000,
      metaDeseosBp: 3000,
      metaAhorroBp: 2000,
    });
  });

  it('the DB rejects goals that do not sum 10000', async () => {
    if (!ALLOW) return;
    await expect(
      prisma.user.update({
        where: { id: userIdB },
        data: { perfilPresupuesto: 'personalizado', metaNecesidadesBp: 6000 },
      }),
    ).rejects.toThrow(/User_metas_suman_10000_check/);
  });

  it('the DB rejects an unknown profile id', async () => {
    if (!ALLOW) return;
    await expect(
      prisma.user.update({
        where: { id: userIdB },
        data: { perfilPresupuesto: '90_5_5' },
      }),
    ).rejects.toThrow(/User_perfilPresupuesto_check/);
  });

  it('the DB rejects a predefined id with goals that are not its own', async () => {
    if (!ALLOW) return;
    await expect(
      prisma.user.update({
        where: { id: userIdB },
        data: { perfilPresupuesto: '80_10_10' },
      }),
    ).rejects.toThrow(/User_perfil_predefinido_metas_check/);
  });

  it('the DB rejects a negative goal', async () => {
    if (!ALLOW) return;
    await expect(
      prisma.user.update({
        where: { id: userIdB },
        data: {
          perfilPresupuesto: 'personalizado',
          metaNecesidadesBp: 11000,
          metaDeseosBp: -1000,
          metaAhorroBp: 0,
        },
      }),
    ).rejects.toThrow(/User_metas_no_negativas_check/);
  });

  // ── Financial month (#111, PER-02, PER-08) ──────────────────────────────

  it('a user who never set it reads cut-off day 1 and no declared income', async () => {
    if (!ALLOW) return;
    const perfil = await repo.obtener(userIdB);
    expect(perfil.mesFinanciero.diaCorte.valor).toBe(1);
    expect(perfil.mesFinanciero.ingresoDeclarado).toBeNull();
  });

  it('saves the cut-off day and declared income with the goals and reads them back', async () => {
    if (!ALLOW) return;
    const mes = MesFinanciero.crear(25, 1_234_567_890_123n).getValue();
    await repo.guardar(
      userIdA,
      PerfilPresupuesto.predefinido('60_20_20').conMesFinanciero(mes),
    );
    const perfil = await repo.obtener(userIdA);
    expect(perfil.perfil).toBe('60_20_20');
    expect(perfil.mesFinanciero.diaCorte.valor).toBe(25);
    expect(perfil.mesFinanciero.ingresoDeclarado).toBe(1_234_567_890_123n);
    const fila = await prisma.user.findUniqueOrThrow({
      where: { id: userIdA },
      select: { diaCorte: true, ingresoDeclarado: true },
    });
    expect(fila).toEqual({
      diaCorte: 25,
      ingresoDeclarado: 1_234_567_890_123n,
    });
  });

  it('saving the default financial month clears the declared income', async () => {
    if (!ALLOW) return;
    await repo.guardar(
      userIdA,
      PerfilPresupuesto.predefinido('60_20_20').conMesFinanciero(
        MesFinanciero.crear(25, 500n).getValue(),
      ),
    );
    await repo.guardar(userIdA, PerfilPresupuesto.porDefecto());
    const fila = await prisma.user.findUniqueOrThrow({
      where: { id: userIdA },
      select: { diaCorte: true, ingresoDeclarado: true },
    });
    expect(fila).toEqual({ diaCorte: 1, ingresoDeclarado: null });
  });

  it('saving A financial month leaves B untouched (isolation, RNF-SEC-006)', async () => {
    if (!ALLOW) return;
    await repo.guardar(
      userIdA,
      PerfilPresupuesto.porDefecto().conMesFinanciero(
        MesFinanciero.crear(15, 700_000n).getValue(),
      ),
    );
    const fila = await prisma.user.findUniqueOrThrow({
      where: { id: userIdB },
      select: { diaCorte: true, ingresoDeclarado: true },
    });
    expect(fila).toEqual({ diaCorte: 1, ingresoDeclarado: null });
  });

  it.each([0, 29])('the DB rejects cut-off day %i', async (dia) => {
    if (!ALLOW) return;
    await expect(
      prisma.user.update({ where: { id: userIdB }, data: { diaCorte: dia } }),
    ).rejects.toThrow(/User_diaCorte_check/);
  });

  it('the DB rejects a declared income that is not positive', async () => {
    if (!ALLOW) return;
    await expect(
      prisma.user.update({
        where: { id: userIdB },
        data: { ingresoDeclarado: 0n },
      }),
    ).rejects.toThrow(/User_ingresoDeclarado_check/);
  });
});
