import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { join } from 'path';
import { AppModule } from '../src/app.module';

describe('IngestaController (e2e) — POST /api/ingestas', () => {
  let app: INestApplication<App>;

  const fixturesDir = join(__dirname, 'fixtures');
  const xlsxFixture = join(fixturesDir, 'movimientos.xlsx');
  const xlsFixture = join(fixturesDir, 'cartola.xls');

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('acepta un archivo .xlsx y retorna 200 con metadata', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/ingestas')
      .attach('file', xlsxFixture)
      .expect(200);

    expect(response.body).toEqual({
      message: 'Archivo recibido correctamente.',
      archivo: {
        nombre: 'movimientos.xlsx',
        extension: '.xlsx',
        tamano_bytes: expect.any(Number),
      },
    });
    expect(response.body.archivo.tamano_bytes).toBeGreaterThan(0);
  });

  it('rechaza un archivo .xls con 400', async () => {
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
});
