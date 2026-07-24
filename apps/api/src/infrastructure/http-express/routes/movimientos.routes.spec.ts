import express, { type Express } from 'express';
import request from 'supertest';
import { registrarMovimientos } from './movimientos.routes';
import { errorMiddleware } from '../middleware/error.middleware';
import { Result } from '../../../shared/result';
import { PeriodoInvalidoError } from '../../../domain/errors/periodo-invalido.error';
import type { ObtenerMovimientosMesUseCase } from '../../../application/use-cases/obtener-movimientos-mes.use-case';

/**
 * Traducción Result<T,E> → HTTP de la lista mensual (port del
 * MovimientosController). Handler aislado; pre-middleware simula `req.userId`.
 */
type Doble = Pick<ObtenerMovimientosMesUseCase, 'execute'>;

const MOVIMIENTOS_OK = { periodo: '2026-07', transacciones: [] };

function probeApp(uc: Doble): Express {
  const app = express();
  const router = express.Router();
  router.use((req, _res, next) => {
    req.userId = 'user-x';
    next();
  });
  registrarMovimientos(router, uc as ObtenerMovimientosMesUseCase);
  app.use('/api', router);
  app.use(errorMiddleware);
  return app;
}

describe('registrarMovimientos — GET /api/movimientos', () => {
  it('200 con el DTO y llama con userId + periodo', async () => {
    const uc = { execute: vi.fn().mockResolvedValue(Result.ok(MOVIMIENTOS_OK)) };
    const res = await request(probeApp(uc)).get('/api/movimientos?periodo=2026-07');

    expect(res.status).toBe(200);
    expect(res.body.periodo).toBe('2026-07');
    expect(res.body.totalTransacciones).toBe(0);
    expect(uc.execute).toHaveBeenCalledWith({ userId: 'user-x', periodo: '2026-07' });
  });

  it('sin periodo → periodo undefined', async () => {
    const uc = { execute: vi.fn().mockResolvedValue(Result.ok(MOVIMIENTOS_OK)) };
    await request(probeApp(uc)).get('/api/movimientos');

    expect(uc.execute).toHaveBeenCalledWith({ userId: 'user-x', periodo: undefined });
  });

  it('400 scrubbeado si el periodo es inválido', async () => {
    const uc = { execute: vi.fn().mockResolvedValue(Result.fail(new PeriodoInvalidoError('periodo-malo'))) };
    const res = await request(probeApp(uc)).get('/api/movimientos?periodo=periodo-malo');

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain('periodo-malo');
  });

  it('500 ante error inesperado (rejection → error middleware)', async () => {
    const uc = { execute: vi.fn().mockRejectedValue(new Error('DB caída')) };
    const res = await request(probeApp(uc)).get('/api/movimientos');

    expect(res.status).toBe(500);
  });
});
