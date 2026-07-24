import express, { type Express } from 'express';
import request from 'supertest';
import { registrarTransacciones } from './transacciones.routes';
import { errorMiddleware } from '../middleware/error.middleware';
import { Result } from '../../../shared/result';
import { Categoria } from '../../../domain/value-objects/categoria';
import { CategoriaInvalidaError } from '../../../domain/errors/categoria-invalida.error';
import { TransaccionNoEncontradaError } from '../../../domain/errors/transaccion-no-encontrada.error';
import type { ReclasificarTransaccionUseCase } from '../../../application/use-cases/reclasificar-transaccion.use-case';

/**
 * Traducción Result<T,E> → HTTP de la reclasificación (port del
 * TransaccionesController). Primera ESCRITURA: parsea body JSON (validación
 * manual, sin class-validator) y traduce el 404 anti-enumeración.
 */
type Doble = Pick<ReclasificarTransaccionUseCase, 'execute'>;

const RECLASIF_OK = { id: 'tx-1', categoria: Categoria.Supermercado, bucket: 'Necesidades' };

function probeApp(uc: Doble): Express {
  const app = express();
  app.use(express.json());
  const router = express.Router();
  router.use((req, _res, next) => {
    req.userId = 'user-x';
    next();
  });
  registrarTransacciones(router, uc as ReclasificarTransaccionUseCase);
  app.use('/api', router);
  app.use(errorMiddleware);
  return app;
}

describe('registrarTransacciones — PATCH /api/transacciones/:id/categoria', () => {
  it('200 con el DTO y llama con userId + transaccionId + categoria', async () => {
    const uc = { execute: vi.fn().mockResolvedValue(Result.ok(RECLASIF_OK)) };
    const res = await request(probeApp(uc))
      .patch('/api/transacciones/tx-1/categoria')
      .send({ categoria: 'Supermercado' });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('tx-1');
    expect(res.body.categoria.nombre).toBe('Supermercado');
    expect(uc.execute).toHaveBeenCalledWith({
      userId: 'user-x',
      transaccionId: 'tx-1',
      categoria: 'Supermercado',
    });
  });

  it('body con categoria no-string → se coacciona a "" (rechazo uniforme en el use case)', async () => {
    const uc = { execute: vi.fn().mockResolvedValue(Result.fail(new CategoriaInvalidaError(''))) };
    await request(probeApp(uc)).patch('/api/transacciones/tx-1/categoria').send({ categoria: 123 });

    expect(uc.execute).toHaveBeenCalledWith({
      userId: 'user-x',
      transaccionId: 'tx-1',
      categoria: '',
    });
  });

  it('400 scrubbeado si la categoria es inválida (no refleja el input)', async () => {
    const uc = { execute: vi.fn().mockResolvedValue(Result.fail(new CategoriaInvalidaError('HackCat'))) };
    const res = await request(probeApp(uc))
      .patch('/api/transacciones/tx-1/categoria')
      .send({ categoria: 'HackCat' });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain('HackCat');
  });

  it('404 si la transacción no existe o no es del usuario (anti-enumeración)', async () => {
    const uc = {
      execute: vi.fn().mockResolvedValue(Result.fail(new TransaccionNoEncontradaError('tx-otro'))),
    };
    const res = await request(probeApp(uc))
      .patch('/api/transacciones/tx-otro/categoria')
      .send({ categoria: 'Supermercado' });

    expect(res.status).toBe(404);
  });

  it('500 ante error inesperado (rejection → error middleware)', async () => {
    const uc = { execute: vi.fn().mockRejectedValue(new Error('DB caída')) };
    const res = await request(probeApp(uc))
      .patch('/api/transacciones/tx-1/categoria')
      .send({ categoria: 'Supermercado' });

    expect(res.status).toBe(500);
  });
});
