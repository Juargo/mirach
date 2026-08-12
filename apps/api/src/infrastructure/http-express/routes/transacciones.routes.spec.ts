import express, { type Express } from 'express';
import request from 'supertest';
import { registrarTransacciones } from './transacciones.routes';
import { errorMiddleware } from '../middleware/error.middleware';
import { Result } from '../../../shared/result';
import { CategoriaDesconocidaError } from '../../../domain/errors/categoria-desconocida.error';
import { TransaccionNoEncontradaError } from '../../../domain/errors/transaccion-no-encontrada.error';
import type { ReclasificarTransaccionUseCase } from '../../../application/use-cases/reclasificar-transaccion.use-case';

/**
 * Traducción Result<T,E> → HTTP de la reclasificación (port del
 * TransaccionesController). Primera ESCRITURA: parsea body JSON (validación
 * manual, sin class-validator) y traduce el 404 anti-enumeración.
 *
 * ADR-037: el 400 ya NO enumera los 8 nombres cerrados del enum retirado —
 * `CategoriaDesconocidaError` (un nombre que no resuelve contra el catálogo
 * REAL del usuario) mapea a un mensaje genérico. Este es uno de los dos
 * deltas de comportamiento intencionales de PR1 (design.md §9): antes el
 * enum-gate rechazaba cualquier nombre desconocido con 400 ANTES de que el
 * adapter pudiera lanzar un 500 por "copia rota"; ahora ese mismo caso llega
 * limpio a `CategoriaDesconocidaError` (400) porque el gate cerrado ya no
 * existe — un camino que antes era inalcanzable.
 */
type Doble = Pick<ReclasificarTransaccionUseCase, 'execute'>;

const RECLASIF_OK = {
  id: 'tx-1',
  categoriaId: 'cat-supermercado-row-id',
  categoria: 'Supermercado',
  bucket: 'Necesidades',
};

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
    // US-037 CAT037-04: el id expuesto es el que resolvió el writer, nunca
    // uno derivado localmente por el DTO.
    expect(res.body.categoria.id).toBe('cat-supermercado-row-id');
    expect(uc.execute).toHaveBeenCalledWith({
      userId: 'user-x',
      transaccionId: 'tx-1',
      categoria: 'Supermercado',
    });
  });

  it('body con categoria no-string → se coacciona a "" (rechazo uniforme, delegado al writer)', async () => {
    const uc = {
      execute: vi
        .fn()
        .mockResolvedValue(Result.fail(new CategoriaDesconocidaError(''))),
    };
    await request(probeApp(uc))
      .patch('/api/transacciones/tx-1/categoria')
      .send({ categoria: 123 });

    expect(uc.execute).toHaveBeenCalledWith({
      userId: 'user-x',
      transaccionId: 'tx-1',
      categoria: '',
    });
  });

  it('400 con mensaje genérico si la categoría no existe en el catálogo del caller — ya NO enumera los 8 nombres', async () => {
    const uc = {
      execute: vi
        .fn()
        .mockResolvedValue(
          Result.fail(new CategoriaDesconocidaError('HackCat')),
        ),
    };
    const res = await request(probeApp(uc))
      .patch('/api/transacciones/tx-1/categoria')
      .send({ categoria: 'HackCat' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(
      'La categoría indicada no existe en tu catálogo.',
    );
    // Scrubbing: el input crudo nunca se refleja, y el mensaje ya no
    // enumera ningún nombre del catálogo (ni los del template ni ninguno).
    expect(JSON.stringify(res.body)).not.toContain('HackCat');
    expect(res.body.message).not.toMatch(/Supermercado|Combustible/);
  });

  it('404 si la transacción no existe o no es del usuario (anti-enumeración)', async () => {
    const uc = {
      execute: vi
        .fn()
        .mockResolvedValue(
          Result.fail(new TransaccionNoEncontradaError('tx-otro')),
        ),
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
