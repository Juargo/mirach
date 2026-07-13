import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { join } from 'path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/persistence/prisma.service';

const RUN_ID = `e2e-${Date.now()}`;

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
  let app: INestApplication<App>;
  let moduleFixture: TestingModule;
  let prisma: PrismaService;

  const fixturesDir = join(__dirname, 'fixtures');
  const xlsxFixture = join(fixturesDir, 'movimientos.xlsx');
  const xlsFixture = join(fixturesDir, 'cartola.xls');

  const createdIngestaIds: string[] = [];

  beforeEach(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = moduleFixture.get(PrismaService);
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(async () => {
    if (createdIngestaIds.length === 0) return;
    const cleanupPrisma = new PrismaService();
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

    const response = await request(app.getHttpServer())
      .post('/api/ingestas')
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
    const enBd = filas
      .map((f) =>
        canon({
          fecha: f.fecha.toISOString(),
          descripcion: f.descripcion,
          cargo: f.cargo.toString(),
          abono: f.abono.toString(),
        }),
      )
      .sort();
    expect(enBd).toEqual(enRespuesta);
  });

  it('rechaza un archivo .xls con 400 (falla en IngestFile, antes de crear ninguna Ingesta)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/ingestas')
      .attach('file', xlsFixture)
      .expect(400);

    expect(response.body.message).toMatch(/\.xls/i);
  });

  it('retorna 400 cuando no se envía archivo', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/ingestas')
      .expect(400);

    expect(response.body.message).toMatch(/archivo/i);
  });

  it('si falla la escritura atómica en persistencia, retorna 500 con mensaje descriptivo y la Ingesta queda FALLIDA', async () => {
    const nombreArchivo = `movimientos-${RUN_ID}-fail.xlsx`;

    // Misma técnica que el int-spec de PR3a: fuerza que la 2da sentencia del
    // $transaction (ingesta.update) apunte a un id inexistente → P2025 →
    // rollback de TODO el commit. La llamada real de markFailed (fuera del
    // $transaction) NO está mockeada, así que sí marca FALLIDA.
    const realUpdate = prisma.ingesta.update.bind(prisma.ingesta);
    const spy = vi
      .spyOn(prisma.ingesta, 'update')
      .mockImplementationOnce((args) =>
        realUpdate({
          where: { id: `inexistente-${Date.now()}` },
          data: args.data,
        }),
      );

    try {
      const response = await request(app.getHttpServer())
        .post('/api/ingestas')
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
      expect(response.body.message).toBe(
        'Persistencia fallida: falló la escritura atómica de transacciones',
      );
      expect(response.body.message).not.toMatch(/\d/);
      expect(fallida).not.toBeNull();
      expect(fallida?.motivoFallo).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });
});
