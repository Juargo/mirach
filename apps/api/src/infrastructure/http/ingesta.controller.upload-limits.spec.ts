import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { IngestaController } from './ingesta.controller';
import { ProcessIngestaUseCase } from '../../application/use-cases/process-ingesta.use-case';
import { Result } from '../../shared/result';

/**
 * Límites de subida del endpoint (Sprint 4, sprint4-pdf-ingesta, PDF-00).
 *
 * Verifica el comportamiento REAL del pipeline HTTP (Multer + interceptor +
 * filtro), no solo el método del controller — el rechazo por tamaño ocurre
 * en el interceptor, ANTES de que el controller se ejecute, así que no se
 * puede probar invocando `controller.ingestar()` directamente (ver
 * ingesta.controller.spec.ts para los casos que sí dependen solo del
 * método).
 */
describe('IngestaController — límites de subida (Multer)', () => {
  async function bootApp(): Promise<{
    app: INestApplication;
    useCase: { execute: ReturnType<typeof vi.fn> };
  }> {
    const useCase = { execute: vi.fn() };
    const moduleRef = await Test.createTestingModule({
      controllers: [IngestaController],
      providers: [{ provide: ProcessIngestaUseCase, useValue: useCase }],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    return { app, useCase };
  }

  it('rechaza con 400 un archivo mayor a 10MB, ANTES de invocar el orquestador', async () => {
    const { app, useCase } = await bootApp();
    try {
      const archivoGrande = Buffer.alloc(10 * 1024 * 1024 + 1, 1);

      const response = await request(app.getHttpServer())
        .post('/api/ingestas')
        .attach('file', archivoGrande, 'cartola.pdf')
        .expect(400);

      const body = response.body as { message: string };
      expect(body.message).toMatch(/10 ?MB/i);
      expect(useCase.execute).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('no filtra por Content-Type: un .pdf llega al orquestador sin ser bloqueado por Multer', async () => {
    const { app, useCase } = await bootApp();
    try {
      useCase.execute.mockResolvedValue(
        Result.ok({
          ingestaId: 'id-1',
          banco: {
            banco: 'BancoEstado',
            tipoCuenta: 'CuentaRUT',
            numeroCuenta: '123',
          },
          archivo: {
            originalName: 'cartola.pdf',
            extension: '.pdf',
            sizeInBytes: 10,
          },
          total: 0,
          transacciones: [],
        }),
      );

      await request(app.getHttpServer())
        .post('/api/ingestas')
        .attach('file', Buffer.from('%PDF-1.4 contenido-de-prueba'), {
          filename: 'cartola.pdf',
          contentType: 'application/pdf',
        })
        .expect(200);

      expect(useCase.execute).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });
});
