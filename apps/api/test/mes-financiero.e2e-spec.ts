/**
 * mes-financiero.e2e-spec.ts — issue #111 (PER-08, ADR-005 §7).
 *
 * The two acceptance scenarios of the issue, through the public HTTP API:
 *   - a salary credited on Friday 23 October counts as income of the period
 *     25 Oct – 24 Nov when the cut-off day is 25 (3-day tolerance);
 *   - changing the cut-off day from 1 to 25 shows every period from the 25th
 *     to the 24th.
 * Plus isolation (ADR-010 §7): another user keeps calendar months.
 * Rule 1 (VIS-10): percentages use the declared income when there is one,
 * and the responses say which income was used.
 */
import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../src/infrastructure/http-express/app';
import { createTestContainer } from './support/test-container';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { BUCKET_IDS } from '../src/infrastructure/persistence/bucket-ids';
import { Bucket } from '../src/domain/value-objects/bucket';
import { crearSesionParaUsuario } from './support/session.fixture';
import { AesGcmCryptoService } from '../src/infrastructure/persistence/aes-gcm-crypto.service';
import { resumenResponseSchema } from '../src/infrastructure/http-express/schemas/resumen.schema';
import { resumenAnualResponseSchema } from '../src/infrastructure/http-express/schemas/resumen-anual.schema';
import { periodosResponseSchema } from '../src/infrastructure/http-express/schemas/periodos.schema';
import { ingresosMesResponseSchema } from '../src/infrastructure/http-express/schemas/ingresos-mes.schema';
import { bucketDetalleMesResponseSchema } from '../src/infrastructure/http-express/schemas/bucket-detalle-mes.schema';
import { semaforoDetalleResponseSchema } from '../src/infrastructure/http-express/schemas/semaforo-detalle.schema';

const API_KEY = process.env.API_KEY ?? '';
const RUN_ID = `mes-financiero-e2e-${Date.now()}`;

interface Rango {
  periodo: string;
  fechaInicio: string;
  fechaFin: string;
}

describe('Mes financiero (e2e, #111)', () => {
  let app: Express;
  let prisma: PrismaClient;
  // Same key as the container: the detail readers decrypt descripcion.
  let crypto: AesGcmCryptoService;
  const sueldo = `${RUN_ID}-sueldo`; // scenario 1
  const corte = `${RUN_ID}-corte`; // scenario 2
  const otro = `${RUN_ID}-otro`; // isolation
  const declarado = `${RUN_ID}-declarado`; // rule 1 (VIS-10)
  const usuarios = [sueldo, corte, otro, declarado];
  const auth: Record<string, string> = {};
  let sueldoId: string;

  async function seedTx(
    userId: string,
    bucket: Bucket,
    monto: bigint,
    fecha: Date,
  ): Promise<string> {
    const accountId = `${userId}-acc`;
    const ingestaId = `${userId}-ing`;
    await prisma.account.upsert({
      where: { id: accountId },
      update: {},
      create: {
        id: accountId,
        userId,
        banco: 'TestBank',
        tipoCuenta: 'CuentaCorriente',
        numeroCuenta: crypto.encrypt(`ACC-${userId}`),
      },
    });
    await prisma.ingesta.upsert({
      where: { id: ingestaId },
      update: {},
      create: {
        id: ingestaId,
        userId,
        accountId,
        banco: 'TestBank',
        nombreArchivo: 'test-mes-financiero.xlsx',
        estado: 'PROCESADA',
      },
    });
    const esIngreso = bucket === Bucket.Ingreso;
    const tx = await prisma.transaccion.create({
      data: {
        accountId,
        ingestaId,
        bucketId: BUCKET_IDS[bucket],
        cargo: esIngreso ? 0n : monto,
        abono: esIngreso ? monto : 0n,
        fecha,
        descripcion: crypto.encrypt('E2E mes financiero'),
      },
    });
    return tx.id;
  }

  const get = (path: string, userId: string) =>
    request(app)
      .get(path)
      .set('x-api-key', API_KEY)
      .set('Authorization', auth[userId]);
  const putCorte = (diaCorte: number, userId: string) =>
    request(app)
      .put('/api/perfil/presupuesto')
      .set('x-api-key', API_KEY)
      .set('Authorization', auth[userId])
      .send({ perfil: '50_30_20', diaCorte });
  const putIngreso = (ingresoDeclarado: string | null, userId: string) =>
    request(app)
      .put('/api/perfil/presupuesto')
      .set('x-api-key', API_KEY)
      .set('Authorization', auth[userId])
      .send({ perfil: '50_30_20', ingresoDeclarado });

  const rangos = async (userId: string): Promise<Rango[]> => {
    const res = await get('/api/periodos', userId).expect(200);
    const body = periodosResponseSchema.parse(res.body);
    expect(body.rangos.map((r) => r.periodo)).toEqual(body.periodos);
    return body.rangos;
  };
  const mesesAnuales = async (userId: string): Promise<Rango[]> => {
    const res = await get('/api/resumen/anual?anio=2026', userId).expect(200);
    return resumenAnualResponseSchema
      .parse(res.body)
      .meses.map(({ periodo, fechaInicio, fechaFin }) => ({
        periodo,
        fechaInicio,
        fechaFin,
      }));
  };

  beforeAll(async () => {
    const env = loadEnv();
    crypto = new AesGcmCryptoService(Buffer.from(env.ENCRYPTION_KEY, 'base64'));
    prisma = createPrismaClient(env);
    await prisma.$connect();
    app = createApp(createTestContainer(env, prisma), env);

    for (const id of usuarios) {
      await prisma.user.create({ data: { id, nombre: `E2E ${id}` } });
      auth[id] = `Bearer ${(await crearSesionParaUsuario(prisma, id)).token}`;
    }

    // Scenario 1: salary on Friday 23 October, expenses on both sides of the
    // 25 October cut-off.
    sueldoId = await seedTx(
      sueldo,
      Bucket.Ingreso,
      2_000_000n,
      new Date(Date.UTC(2026, 9, 23, 12)),
    );
    await seedTx(
      sueldo,
      Bucket.Necesidades,
      300_000n,
      new Date(Date.UTC(2026, 9, 24, 12)), // period 2026-09
    );
    await seedTx(
      sueldo,
      Bucket.Necesidades,
      500_000n,
      new Date(Date.UTC(2026, 10, 10, 12)), // period 2026-10
    );

    // Rule 1: May has 1 000 000 of detected income and 500 000 of needs.
    await seedTx(
      declarado,
      Bucket.Ingreso,
      1_000_000n,
      new Date(Date.UTC(2026, 4, 5, 12)),
    );
    await seedTx(
      declarado,
      Bucket.Necesidades,
      500_000n,
      new Date(Date.UTC(2026, 4, 10, 12)),
    );

    // Scenario 2 and isolation: the same March movements for both users.
    for (const userId of [corte, otro]) {
      await seedTx(
        userId,
        Bucket.Necesidades,
        100_000n,
        new Date(Date.UTC(2026, 2, 10, 12)),
      );
      await seedTx(
        userId,
        Bucket.Deseos,
        40_000n,
        new Date(Date.UTC(2026, 2, 28, 12)),
      );
    }
  });

  afterAll(async () => {
    await prisma.transaccion.deleteMany({
      where: { account: { userId: { in: usuarios } } },
    });
    await prisma.ingesta.deleteMany({ where: { userId: { in: usuarios } } });
    await prisma.account.deleteMany({ where: { userId: { in: usuarios } } });
    await prisma.session.deleteMany({ where: { userId: { in: usuarios } } });
    await prisma.user.deleteMany({ where: { id: { in: usuarios } } });
    await prisma.$disconnect();
  });

  describe('Escenario: sueldo adelantado por fin de semana', () => {
    it('Dado un corte el día 25 y un sueldo abonado el viernes 23 de octubre Cuando Marcela abre el período 25 oct – 24 nov Entonces el sueldo cuenta como ingreso de ese período', async () => {
      await putCorte(25, sueldo).expect(200);

      const resumen = resumenResponseSchema.parse(
        (await get('/api/resumen?periodo=2026-10', sueldo).expect(200)).body,
      );
      expect(resumen).toMatchObject({
        periodo: '2026-10',
        fechaInicio: '2026-10-25',
        fechaFin: '2026-11-24',
        totalIngreso: '2000000',
        sinIngreso: false,
      });
      // Only the expense inside 25 Oct – 24 Nov; the 24 Oct one is September's.
      expect(
        resumen.buckets.find((b) => b.bucket === Bucket.Necesidades)?.total,
      ).toBe('500000');

      const ingresos = ingresosMesResponseSchema.parse(
        (await get('/api/ingresos/mes?periodo=2026-10', sueldo).expect(200))
          .body,
      );
      expect(ingresos).toMatchObject({
        fechaInicio: '2026-10-25',
        fechaFin: '2026-11-24',
        total: '2000000',
        conteo: 1,
      });
      expect(ingresos.transacciones.map((t) => t.id)).toEqual([sueldoId]);

      const detalle = bucketDetalleMesResponseSchema.parse(
        (
          await get(
            '/api/buckets/Necesidades/detalle?periodo=2026-10',
            sueldo,
          ).expect(200)
        ).body,
      );
      expect(detalle).toMatchObject({
        periodo: '2026-10',
        fechaInicio: '2026-10-25',
        fechaFin: '2026-11-24',
        total: '500000',
        totalTransacciones: 1,
      });

      // The salary is not counted again in the period it was credited in.
      const septiembre = resumenResponseSchema.parse(
        (await get('/api/resumen?periodo=2026-09', sueldo).expect(200)).body,
      );
      expect(septiembre).toMatchObject({
        fechaInicio: '2026-09-25',
        fechaFin: '2026-10-24',
        totalIngreso: '0',
        sinIngreso: true,
      });
    });
  });

  describe('Escenario: cambiar el día de corte recalcula todo', () => {
    it('Dado un corte el día 1 Cuando Marcela cambia el corte al día 25 Entonces todos los períodos se muestran del 25 al 24', async () => {
      // Dado un corte el día 1: calendar months.
      const perfil = await get('/api/perfil/presupuesto', corte).expect(200);
      expect(perfil.body.diaCorte).toBe(1);
      expect(await rangos(corte)).toEqual([
        {
          periodo: '2026-03',
          fechaInicio: '2026-03-01',
          fechaFin: '2026-03-31',
        },
      ]);
      const antes = await mesesAnuales(corte);
      expect(antes[0]).toEqual({
        periodo: '2026-01',
        fechaInicio: '2026-01-01',
        fechaFin: '2026-01-31',
      });
      expect(antes[1].fechaFin).toBe('2026-02-28');

      // Cuando Marcela cambia el corte al día 25.
      await putCorte(25, corte).expect(200);

      // Entonces todos los períodos se muestran del 25 al 24.
      expect(await rangos(corte)).toEqual([
        {
          periodo: '2026-03',
          fechaInicio: '2026-03-25',
          fechaFin: '2026-04-24',
        },
        {
          periodo: '2026-02',
          fechaInicio: '2026-02-25',
          fechaFin: '2026-03-24',
        },
      ]);
      const despues = await mesesAnuales(corte);
      expect(despues).toHaveLength(12);
      for (const mes of despues) {
        expect(mes.fechaInicio).toBe(`${mes.periodo}-25`);
        expect(mes.fechaFin.endsWith('-24')).toBe(true);
      }
      expect(despues[11].fechaFin).toBe('2027-01-24');

      // And the amounts move with the periods: 10 March is now February's.
      const anual = resumenAnualResponseSchema.parse(
        (await get('/api/resumen/anual?anio=2026', corte).expect(200)).body,
      );
      const total = (mes: number, bucket: Bucket) =>
        anual.meses[mes].buckets.find((b) => b.bucket === bucket)?.total;
      expect(total(1, Bucket.Necesidades)).toBe('100000');
      expect(total(2, Bucket.Necesidades)).toBe('0');
      expect(total(2, Bucket.Deseos)).toBe('40000');

      const resumen = resumenResponseSchema.parse(
        (await get('/api/resumen?periodo=2026-02', corte).expect(200)).body,
      );
      expect(resumen).toMatchObject({
        fechaInicio: '2026-02-25',
        fechaFin: '2026-03-24',
      });
    });
  });

  it('isolation: another user keeps calendar months after Marcela changes her cut-off day', async () => {
    await putCorte(25, corte).expect(200);

    expect(await rangos(otro)).toEqual([
      { periodo: '2026-03', fechaInicio: '2026-03-01', fechaFin: '2026-03-31' },
    ]);
    const meses = await mesesAnuales(otro);
    expect(meses[2]).toEqual({
      periodo: '2026-03',
      fechaInicio: '2026-03-01',
      fechaFin: '2026-03-31',
    });
    const resumen = resumenResponseSchema.parse(
      (await get('/api/resumen', otro).expect(200)).body,
    );
    expect(resumen).toMatchObject({
      periodo: '2026-03',
      fechaInicio: '2026-03-01',
      fechaFin: '2026-03-31',
    });
    expect(
      resumen.buckets.find((b) => b.bucket === Bucket.Necesidades)?.total,
    ).toBe('100000');
  });

  describe('Regla 1: base de los porcentajes (VIS-10)', () => {
    const necesidades = <T extends { bucket: string }>(buckets: T[]) =>
      buckets.find((b) => b.bucket === Bucket.Necesidades);

    async function leerMayo(userId: string) {
      const resumen = resumenResponseSchema.parse(
        (await get('/api/resumen?periodo=2026-05', userId).expect(200)).body,
      );
      const anual = resumenAnualResponseSchema.parse(
        (await get('/api/resumen/anual?anio=2026', userId).expect(200)).body,
      );
      const semaforo = semaforoDetalleResponseSchema.parse(
        (await get('/api/resumen/semaforo?periodo=2026-05', userId).expect(200))
          .body,
      );
      const detalle = bucketDetalleMesResponseSchema.parse(
        (
          await get(
            '/api/buckets/Necesidades/detalle?periodo=2026-05',
            userId,
          ).expect(200)
        ).body,
      );
      const ingresos = ingresosMesResponseSchema.parse(
        (await get('/api/ingresos/mes?periodo=2026-05', userId).expect(200))
          .body,
      );
      return { resumen, mayo: anual.meses[4], semaforo, detalle, ingresos };
    }

    it('with a declared income the percentages use it and the responses say "declarado"', async () => {
      await putIngreso('2000000', declarado).expect(200);

      const { resumen, mayo, semaforo, detalle, ingresos } =
        await leerMayo(declarado);

      const base = {
        totalIngreso: '2000000',
        fuenteIngreso: 'declarado',
        ingresoDetectado: '1000000',
        sinIngreso: false,
      };
      expect(resumen).toMatchObject(base);
      expect(necesidades(resumen.buckets)?.porcentajeBp).toBe(2500);
      expect(mayo).toMatchObject({ periodo: '2026-05', ...base });
      expect(necesidades(mayo.buckets)?.porcentajeBp).toBe(2500);
      expect(semaforo).toMatchObject(base);
      expect(necesidades(semaforo.buckets)?.porcentajeBp).toBe(2500);
      expect(detalle).toMatchObject({
        fuenteIngreso: 'declarado',
        porcentajeBp: 2500,
        total: '500000',
      });
      // /ingresos/mes lists the income movements: its total stays detected.
      expect(ingresos.total).toBe('1000000');

      // A month without income credits still has the declared base (PER-06).
      const anual = resumenAnualResponseSchema.parse(
        (await get('/api/resumen/anual?anio=2026', declarado).expect(200)).body,
      );
      expect(anual.meses[0]).toMatchObject({
        totalIngreso: '2000000',
        fuenteIngreso: 'declarado',
        ingresoDetectado: '0',
        sinIngreso: false,
      });
    });

    it('clearing the declared income with null returns to "detectado"', async () => {
      await putIngreso('2000000', declarado).expect(200);
      await putIngreso(null, declarado).expect(200);

      const { resumen, mayo, semaforo, detalle } = await leerMayo(declarado);

      const base = {
        totalIngreso: '1000000',
        fuenteIngreso: 'detectado',
        ingresoDetectado: '1000000',
        sinIngreso: false,
      };
      expect(resumen).toMatchObject(base);
      expect(necesidades(resumen.buckets)?.porcentajeBp).toBe(5000);
      expect(mayo).toMatchObject(base);
      expect(semaforo).toMatchObject(base);
      expect(detalle).toMatchObject({
        fuenteIngreso: 'detectado',
        porcentajeBp: 5000,
      });
    });

    it('isolation: another user keeps "detectado" while Marcela declares her income', async () => {
      await putIngreso('2000000', declarado).expect(200);

      const resumen = resumenResponseSchema.parse(
        (await get('/api/resumen?periodo=2026-03', otro).expect(200)).body,
      );
      expect(resumen).toMatchObject({
        totalIngreso: '0',
        fuenteIngreso: 'detectado',
        ingresoDetectado: '0',
        sinIngreso: true,
      });
      const detalle = bucketDetalleMesResponseSchema.parse(
        (
          await get(
            '/api/buckets/Necesidades/detalle?periodo=2026-03',
            otro,
          ).expect(200)
        ).body,
      );
      expect(detalle).toMatchObject({
        fuenteIngreso: 'detectado',
        porcentajeBp: null,
      });
    });
  });
});
