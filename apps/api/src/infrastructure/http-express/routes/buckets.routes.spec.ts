import express, { type Express } from 'express';
import request from 'supertest';
import { registrarBuckets } from './buckets.routes';
import { errorMiddleware } from '../middleware/error.middleware';
import { Result } from '../../../shared/result';
import { BucketInvalidoError } from '../../../domain/errors/bucket-invalido.error';
import { PeriodoInvalidoError } from '../../../domain/errors/periodo-invalido.error';
import type { ObtenerDetalleBucketUseCase } from '../../../application/use-cases/obtener-detalle-bucket.use-case';

/**
 * Traducción Result<T,E> → HTTP del detalle de bucket (port del
 * DetalleBucketController). Handler aislado; un pre-middleware simula el
 * `req.userId` del session middleware.
 */
type Doble = Pick<ObtenerDetalleBucketUseCase, 'execute'>;

const DETALLE_OK = { periodo: '2026-07', bucket: 'Necesidades', transacciones: [] };

function probeApp(uc: Doble): Express {
  const app = express();
  const router = express.Router();
  router.use((req, _res, next) => {
    req.userId = 'user-x';
    next();
  });
  registrarBuckets(router, uc as ObtenerDetalleBucketUseCase);
  app.use('/api', router);
  app.use(errorMiddleware);
  return app;
}

describe('registrarBuckets — GET /api/buckets/:bucket', () => {
  it('200 con el DTO y llama con userId + bucket + periodo', async () => {
    const uc = { execute: vi.fn().mockResolvedValue(Result.ok(DETALLE_OK)) };
    const res = await request(probeApp(uc)).get('/api/buckets/Necesidades?periodo=2026-07');

    expect(res.status).toBe(200);
    expect(res.body.bucket).toBe('Necesidades');
    expect(uc.execute).toHaveBeenCalledWith({
      userId: 'user-x',
      bucket: 'Necesidades',
      periodo: '2026-07',
    });
  });

  it('sin periodo → periodo undefined', async () => {
    const uc = { execute: vi.fn().mockResolvedValue(Result.ok(DETALLE_OK)) };
    await request(probeApp(uc)).get('/api/buckets/Deseos');

    expect(uc.execute).toHaveBeenCalledWith({ userId: 'user-x', bucket: 'Deseos', periodo: undefined });
  });

  it('400 scrubbeado si el bucket es inválido (nunca refleja el input crudo)', async () => {
    const uc = { execute: vi.fn().mockResolvedValue(Result.fail(new BucketInvalidoError('HackerBucket'))) };
    const res = await request(probeApp(uc)).get('/api/buckets/HackerBucket');

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain('HackerBucket');
  });

  it('400 scrubbeado si el periodo es inválido', async () => {
    const uc = { execute: vi.fn().mockResolvedValue(Result.fail(new PeriodoInvalidoError('periodo-malo'))) };
    const res = await request(probeApp(uc)).get('/api/buckets/Necesidades?periodo=periodo-malo');

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain('periodo-malo');
  });

  it('500 ante error inesperado (rejection → error middleware)', async () => {
    const uc = { execute: vi.fn().mockRejectedValue(new Error('DB caída')) };
    const res = await request(probeApp(uc)).get('/api/buckets/Ahorro');

    expect(res.status).toBe(500);
  });
});
