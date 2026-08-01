import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { join } from 'path';
import { createApp } from '../src/infrastructure/http-express/app';
import { createContainer } from '../src/composition/container';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv, type Env } from '../src/config/env';
import { AesGcmCryptoService } from '../src/infrastructure/persistence/aes-gcm-crypto.service';
import { loginAsSeededUser, type Sesion } from './support/login.e2e-helper';

const RUN_ID = `e2e-${Date.now()}`;
const API_KEY = process.env.API_KEY ?? '';

/**
 * E2E de POST /api/ingestas contra una BD real de desarrollo (US-011, PR4).
 *
 * Corre el pipeline HTTP completo vía ProcessIngestaUseCase — el mismo
 * orquestador que usa el CLI —, así que estos tests PERSISTEN filas reales.
 * Requiere ALLOW_DESTRUCTIVE_DB=1 (gate compartido con test:integration, ver
 * test/integration.setup.ts); `pnpm api test:e2e` ya lo exporta. Cada test
 * limpia sus propias filas (Ingesta/Transaccion) en afterAll — la cuenta
 * (Account) es idempotente por clave natural, no se borra.
 *
 * Cada test sube el mismo fixture bajo un NOMBRE ÚNICO por corrida (RUN_ID),
 * para poder correlacionar su propia Ingesta en la BD compartida sin
 * ambigüedad (en vez de "la más reciente con este nombre").
 */
describe('IngestaController (e2e) — POST /api/ingestas', () => {
  let app: Express;
  let prisma: PrismaClient;
  let sesion: Sesion;
  let env: Env;

  const fixturesDir = join(__dirname, 'fixtures');
  const xlsxFixture = join(fixturesDir, 'movimientos-test.xlsx');
  const xlsFixture = join(fixturesDir, 'cartola-test.xls');

  const createdIngestaIds: string[] = [];

  beforeEach(async () => {
    env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();
    app = createApp(createContainer(env, prisma), env);
    sesion = await loginAsSeededUser(app);
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  afterAll(async () => {
    if (createdIngestaIds.length === 0) return;
    const cleanupPrisma = createPrismaClient(loadEnv());
    await cleanupPrisma.$connect();
    await cleanupPrisma.transaccion.deleteMany({
      where: { ingestaId: { in: createdIngestaIds } },
    });
    await cleanupPrisma.ingesta.deleteMany({
      where: { id: { in: createdIngestaIds } },
    });
    await cleanupPrisma.$disconnect();
  });

  it('acepta un archivo .xlsx válido, lo persiste vía ProcessIngestaUseCase y retorna el contrato HTTP completo', async () => {
    const nombreArchivo = `movimientos-${RUN_ID}-ok.xlsx`;

    const response = await request(app)
      .post('/api/ingestas')
      .set('x-api-key', API_KEY)
      .set('Cookie', sesion.cookie)
      .attach('file', xlsxFixture, nombreArchivo)
      .expect(200);

    // Registrar ANTES de cualquier expect(): un assertion fallido más abajo
    // no debe dejar la fila huérfana en la BD compartida de desarrollo.
    createdIngestaIds.push(response.body.ingestaId);

    expect(typeof response.body.ingestaId).toBe('string');
    expect(response.body.ingestaId.length).toBeGreaterThan(0);
    expect(response.body.banco).toBe('BCI');
    expect(response.body.tipoCuenta).toBe('Cuenta Corriente');
    expect(response.body.archivo).toEqual({
      nombre: nombreArchivo,
      extension: '.xlsx',
      tamanoBytes: expect.any(Number),
    });
    expect(response.body.totalTransacciones).toBe(
      response.body.transacciones.length,
    );
    expect(response.body.transacciones.length).toBeGreaterThan(0);
    // cargo/abono viajan como STRING — JSON no serializa BigInt nativamente.
    for (const tx of response.body.transacciones) {
      expect(typeof tx.cargo).toBe('string');
      expect(typeof tx.abono).toBe('string');
      expect(typeof tx.fecha).toBe('string');
      expect(typeof tx.descripcion).toBe('string');
    }

    // La fila realmente quedó PROCESADA en la BD (no solo en la respuesta).
    const ingesta = await prisma.ingesta.findUnique({
      where: { id: response.body.ingestaId },
    });
    expect(ingesta?.estado).toBe('PROCESADA');

    // Equivalencia con lo REALMENTE persistido (ADR-015, énfasis en dinero):
    // la respuesta HTTP viene del output de normalize (antes del mapper
    // BigInt de escritura), así que "no lanzó" no prueba que el dinero haya
    // llegado intacto a `transaccion`. Comparamos como multiset (no por
    // posición): createMany + un único `now()` por statement no garantiza
    // que leer por creadoEn ASC devuelva el mismo orden de inserción.
    const filas = await prisma.transaccion.findMany({
      where: { ingestaId: response.body.ingestaId },
    });
    expect(filas).toHaveLength(response.body.transacciones.length);

    const canon = (t: {
      fecha: string;
      descripcion: string;
      cargo: string;
      abono: string;
    }) => `${t.fecha}|${t.descripcion}|${t.cargo}|${t.abono}`;
    const enRespuesta = response.body.transacciones.map(canon).sort();
    // ADR-013: `descripcion` se persiste cifrada (AES-256-GCM). Leer la fila
    // cruda devuelve ciphertext `v1:...`, así que hay que descifrarla con la
    // misma clave (ENCRYPTION_KEY de env) para comparar contra la respuesta
    // HTTP, que ya viene descifrada. Esto prueba el round-trip completo:
    // el valor almacenado descifra de vuelta a lo que devuelve la API.
    const crypto = new AesGcmCryptoService(
      Buffer.from(env.ENCRYPTION_KEY, 'base64'),
    );
    const enBd = filas
      .map((f) =>
        canon({
          fecha: f.fecha.toISOString(),
          descripcion: crypto.decrypt(f.descripcion),
          cargo: f.cargo.toString(),
          abono: f.abono.toString(),
        }),
      )
      .sort();
    expect(enBd).toEqual(enRespuesta);
  });

  it('rechaza un archivo .xls con 400 y registra exactamente una fila FALLIDA (ING-07)', async () => {
    const nombreArchivo = `cartola-${RUN_ID}-rechazo.xls`;

    const response = await request(app)
      .post('/api/ingestas')
      .set('x-api-key', API_KEY)
      .set('Cookie', sesion.cookie)
      .attach('file', xlsFixture, nombreArchivo)
      .expect(400);

    expect(response.body.message).toMatch(/\.xls/i);

    // Bajo ING-07 esto INVIERTE la aserción pre-US-004 ("no crea ninguna
    // Ingesta"): el boundary `registrarFallo` (design.md §3.2) registra una
    // fila FALLIDA incluso para un rechazo temprano de extensión — el
    // historial debe mostrar también los intentos fallidos, no solo los
    // éxitos.
    const fallida = await prisma.ingesta.findFirst({
      where: { nombreArchivo, estado: 'FALLIDA' },
    });

    // Registrar ANTES de cualquier expect(): un assertion fallido más abajo
    // no debe dejar la fila huérfana.
    if (fallida) createdIngestaIds.push(fallida.id);

    expect(fallida).not.toBeNull();
    expect(fallida?.motivoFallo).toMatch(/\.xls/i);
  });

  it('retorna 400 cuando no se envía archivo', async () => {
    const response = await request(app)
      .post('/api/ingestas')
      .set('x-api-key', API_KEY)
      .set('Cookie', sesion.cookie)
      .expect(400);

    expect(response.body.message).toMatch(/archivo/i);
  });

  it('si falla la escritura atómica en persistencia, retorna 500 con mensaje descriptivo y la Ingesta queda FALLIDA', async () => {
    const nombreArchivo = `movimientos-${RUN_ID}-fail.xlsx`;

    // El persist-path collapse (US-004, §7.1) dejó un ÚNICO escritor de
    // PROCESADA: un solo `ingesta.create` con `transacciones.createMany`
    // anidado (ya no hay un `ingesta.update` separado que interceptar, como
    // en la técnica pre-US-004). Se fuerza la MISMA falla atómica que la
    // CHECK-violation de `historial-ingestas.int-spec.ts` prueba a nivel de
    // repositorio, pero acá vía spy en la única llamada de escritura — el
    // efecto observable es idéntico: `persistirProcesada` cae al catch y
    // retorna `Result.fail(PersistenciaFallidaError)`. La llamada real de
    // `registrarFallo` (un SEGUNDO `ingesta.create`, con `estado: FALLIDA`,
    // fuera de este mock de una sola vez) NO está mockeada, así que sí marca
    // FALLIDA.
    const spy = vi
      .spyOn(prisma.ingesta, 'create')
      .mockImplementationOnce(() => {
        throw new Error('Simulated atomic write failure (test-forced)');
      });

    try {
      const response = await request(app)
        .post('/api/ingestas')
        .set('x-api-key', API_KEY)
        .set('Cookie', sesion.cookie)
        .attach('file', xlsxFixture, nombreArchivo)
        .expect(500);

      // Correlación por nombre de archivo ÚNICO de esta corrida (no por "la
      // más reciente FALLIDA con ese nombre" — ambiguo en una BD compartida).
      const fallida = await prisma.ingesta.findFirst({
        where: { nombreArchivo, estado: 'FALLIDA' },
      });

      // Registrar ANTES de cualquier expect(): un assertion fallido más abajo
      // no debe dejar la fila huérfana.
      if (fallida) createdIngestaIds.push(fallida.id);

      // Mensaje fijo y genérico: nunca interpola montos ni datos crudos.
      // Coincide con PrismaIngestaRepository.persistirProcesada's catch
      // (prisma-ingesta.repository.ts) — "de la ingesta", no "de
      // transacciones" (mensaje pre-US-004, ya no vigente tras el collapse).
      expect(response.body.message).toBe(
        'Persistencia fallida: falló la escritura atómica de la ingesta',
      );
      expect(response.body.message).not.toMatch(/\d/);
      expect(fallida).not.toBeNull();
      expect(fallida?.motivoFallo).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });
});
