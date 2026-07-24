import express, { type Express } from 'express';
import request from 'supertest';
import { registrarResumen } from './resumen.routes';
import { errorMiddleware } from '../middleware/error.middleware';
import { Result } from '../../../shared/result';
import { PeriodoInvalidoError } from '../../../domain/errors/periodo-invalido.error';
import { AnioInvalidoError } from '../../../domain/errors/anio-invalido.error';
import type { CalcularResumenMesUseCase } from '../../../application/use-cases/calcular-resumen-mes.use-case';
import type { CalcularResumenAnualUseCase } from '../../../application/use-cases/calcular-resumen-anual.use-case';

/**
 * Traducción Result<T,E> → HTTP del endpoint resumen (port del ResumenController).
 * Se prueba el handler aislado (sin la cadena de auth): un pre-middleware simula
 * el `req.userId` que en prod pone el session middleware. La cadena de auth y el
 * aislamiento se cubren en app.resumen.spec.ts (el gate).
 */
type MesDoble = Pick<CalcularResumenMesUseCase, 'execute'>;
type AnualDoble = Pick<CalcularResumenAnualUseCase, 'execute'>;

const RESUMEN_MES_OK = {
  totalIngreso: 100000n,
  sinIngreso: false,
  buckets: [],
  estadoGlobal: null,
};
const RESUMEN_ANUAL_OK = { anio: 2026, meses: [] };

function probeApp(mes: MesDoble, anual: AnualDoble): Express {
  const app = express();
  const router = express.Router();
  router.use((req, _res, next) => {
    req.userId = 'user-x';
    next();
  });
  registrarResumen(router, mes as CalcularResumenMesUseCase, anual as CalcularResumenAnualUseCase);
  app.use('/api', router);
  app.use(errorMiddleware);
  return app;
}

describe('registrarResumen', () => {
  describe('GET /api/resumen', () => {
    it('200 con el DTO y llama al use case con userId + periodo', async () => {
      const mes = {
        execute: vi.fn().mockResolvedValue(Result.ok({ periodo: '2026-07', resumen: RESUMEN_MES_OK })),
      };
      const res = await request(probeApp(mes, { execute: vi.fn() })).get('/api/resumen?periodo=2026-07');

      expect(res.status).toBe(200);
      expect(res.body.periodo).toBe('2026-07');
      expect(mes.execute).toHaveBeenCalledWith({ userId: 'user-x', periodo: '2026-07' });
    });

    it('sin periodo → llama con periodo undefined', async () => {
      const mes = {
        execute: vi.fn().mockResolvedValue(Result.ok({ periodo: '2026-07', resumen: RESUMEN_MES_OK })),
      };
      await request(probeApp(mes, { execute: vi.fn() })).get('/api/resumen');

      expect(mes.execute).toHaveBeenCalledWith({ userId: 'user-x', periodo: undefined });
    });

    it('400 scrubbeado si el periodo es inválido (nunca refleja el input)', async () => {
      const mes = {
        execute: vi.fn().mockResolvedValue(Result.fail(new PeriodoInvalidoError('input-malo'))),
      };
      const res = await request(probeApp(mes, { execute: vi.fn() })).get('/api/resumen?periodo=input-malo');

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).not.toContain('input-malo');
    });

    it('500 ante error inesperado (rejection → error middleware)', async () => {
      const mes = { execute: vi.fn().mockRejectedValue(new Error('DB caída')) };
      const res = await request(probeApp(mes, { execute: vi.fn() })).get('/api/resumen');

      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/resumen/anual', () => {
    it('200 con el DTO y llama con userId + anio', async () => {
      const anual = {
        execute: vi.fn().mockResolvedValue(Result.ok({ resumenAnual: RESUMEN_ANUAL_OK })),
      };
      const res = await request(probeApp({ execute: vi.fn() }, anual)).get('/api/resumen/anual?anio=2026');

      expect(res.status).toBe(200);
      expect(res.body.anio).toBe(2026);
      expect(anual.execute).toHaveBeenCalledWith({ userId: 'user-x', anio: '2026' });
    });

    it('400 scrubbeado si el anio es inválido', async () => {
      const anual = {
        execute: vi.fn().mockResolvedValue(Result.fail(new AnioInvalidoError(99999))),
      };
      const res = await request(probeApp({ execute: vi.fn() }, anual)).get('/api/resumen/anual?anio=99999');

      expect(res.status).toBe(400);
    });
  });
});
