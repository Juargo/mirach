import express, { type Express } from 'express';
import request from 'supertest';
import {
  registrarTransacciones,
  registrarReevaluarCategorias,
  type AprendizajeTransacciones,
} from './transacciones.routes';
import { CategoriaInternaProtegidaError } from '../../../domain/errors/categoria-interna-protegida.error';
import { errorMiddleware } from '../middleware/error.middleware';
import { Result } from '../../../shared/result';
import { CategoriaDesconocidaError } from '../../../domain/errors/categoria-desconocida.error';
import { TransaccionNoEncontradaError } from '../../../domain/errors/transaccion-no-encontrada.error';
import { CategorizacionFallidaError } from '../../../domain/errors/categorizacion-fallida.error';
import type { ReclasificarTransaccionUseCase } from '../../../application/use-cases/reclasificar-transaccion.use-case';
import type { ReevaluarCategoriasUseCase } from '../../../application/use-cases/reevaluar-categorias.use-case';

/**
 * Traducción Result<T,E> → HTTP de la reclasificación (port del
 * TransaccionesController). Primera ESCRITURA: parsea body JSON (validación
 * manual, sin class-validator) y traduce el 404 anti-enumeración.
 *
 * ADR-037: el 400 ya NO enumera los 8 nombres cerrados del enum retirado —
 * `CategoriaDesconocidaError` (un id que no resuelve contra el catálogo REAL
 * del usuario) mapea a un mensaje genérico. Este es uno de los dos deltas de
 * comportamiento intencionales de PR1 (design.md §9): antes el enum-gate
 * rechazaba cualquier nombre desconocido con 400 ANTES de que el adapter
 * pudiera lanzar un 500 por "copia rota"; ahora ese mismo caso llega limpio a
 * `CategoriaDesconocidaError` (400) porque el gate cerrado ya no existe — un
 * camino que antes era inalcanzable.
 *
 * ADR-042: el body pasa de `{ categoria: <nombre> }` a `{ categoriaId }`,
 * corte duro sin alias de transición.
 */
type Doble = Pick<ReclasificarTransaccionUseCase, 'execute'>;

const RECLASIF_OK = {
  id: 'tx-1',
  categoriaId: 'cat-supermercado-row-id',
  categoria: 'Supermercado',
  bucket: 'Necesidades',
};

function makeAprendizaje(
  overrides: Partial<AprendizajeTransacciones> = {},
): AprendizajeTransacciones {
  return {
    obtenerParecidos: {
      execute: vi.fn().mockResolvedValue(
        Result.ok({
          patron: 'cabify',
          total: 3,
          existente: {
            patronId: 'pat-9',
            categoriaId: 'cat-auto',
            categoria: 'Auto',
            bucket: 'Necesidades',
          },
        }),
      ),
    },
    reclasificarConParecidos: {
      execute: vi
        .fn()
        .mockResolvedValue(Result.ok({ ...RECLASIF_OK, movidos: 4 })),
    },
    ...overrides,
  } as unknown as AprendizajeTransacciones;
}

function probeApp(
  uc: Doble,
  aprendizaje: AprendizajeTransacciones = makeAprendizaje(),
): Express {
  const app = express();
  app.use(express.json());
  const router = express.Router();
  router.use((req, _res, next) => {
    req.userId = 'user-x';
    next();
  });
  registrarTransacciones(
    router,
    uc as ReclasificarTransaccionUseCase,
    aprendizaje,
  );
  app.use('/api', router);
  app.use(errorMiddleware);
  return app;
}

describe('registrarTransacciones — PATCH /api/transacciones/:id/categoria', () => {
  it('200 con el DTO y llama con userId + transaccionId + categoriaId', async () => {
    const uc = { execute: vi.fn().mockResolvedValue(Result.ok(RECLASIF_OK)) };
    const res = await request(probeApp(uc))
      .patch('/api/transacciones/tx-1/categoria')
      .send({ categoriaId: 'cat-supermercado-row-id' });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('tx-1');
    expect(res.body.categoria.nombre).toBe('Supermercado');
    // US-037 CAT037-04: el id expuesto es el que resolvió el writer, nunca
    // uno derivado localmente por el DTO.
    expect(res.body.categoria.id).toBe('cat-supermercado-row-id');
    expect(uc.execute).toHaveBeenCalledWith({
      userId: 'user-x',
      transaccionId: 'tx-1',
      categoriaId: 'cat-supermercado-row-id',
    });
  });

  it('without aplicarAParecidos: the previous body plus movidos 0; the apply flow is not called', async () => {
    const uc = { execute: vi.fn().mockResolvedValue(Result.ok(RECLASIF_OK)) };
    const aprendizaje = makeAprendizaje();
    const res = await request(probeApp(uc, aprendizaje))
      .patch('/api/transacciones/tx-1/categoria')
      .send({ categoriaId: 'cat-supermercado-row-id' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 'tx-1',
      categoria: { id: 'cat-supermercado-row-id', nombre: 'Supermercado' },
      bucket: 'Necesidades',
      movidos: 0,
    });
    expect(aprendizaje.reclasificarConParecidos.execute).not.toHaveBeenCalled();
  });

  it('with aplicarAParecidos: runs the apply flow and reports movidos (CLA-03, S6)', async () => {
    const uc = { execute: vi.fn() };
    const aprendizaje = makeAprendizaje();
    const res = await request(probeApp(uc, aprendizaje))
      .patch('/api/transacciones/tx-1/categoria')
      .send({
        categoriaId: 'cat-supermercado-row-id',
        aplicarAParecidos: { periodo: '2026-07' },
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 'tx-1',
      categoria: { id: 'cat-supermercado-row-id', nombre: 'Supermercado' },
      bucket: 'Necesidades',
      movidos: 4,
    });
    expect(aprendizaje.reclasificarConParecidos.execute).toHaveBeenCalledWith({
      userId: 'user-x',
      transaccionId: 'tx-1',
      categoriaId: 'cat-supermercado-row-id',
      periodo: '2026-07',
    });
    expect(uc.execute).not.toHaveBeenCalled();
  });

  it('400 BODY_INVALIDO when aplicarAParecidos has no periodo', async () => {
    const uc = { execute: vi.fn() };
    const aprendizaje = makeAprendizaje();
    const res = await request(probeApp(uc, aprendizaje))
      .patch('/api/transacciones/tx-1/categoria')
      .send({ categoriaId: 'cat-1', aplicarAParecidos: {} });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BODY_INVALIDO');
    expect(aprendizaje.reclasificarConParecidos.execute).not.toHaveBeenCalled();
    expect(uc.execute).not.toHaveBeenCalled();
  });

  it('with aplicarAParecidos: 403 CATEGORIA_INTERNA on an internal category (CLA-18)', async () => {
    const aprendizaje = makeAprendizaje({
      reclasificarConParecidos: {
        execute: vi
          .fn()
          .mockResolvedValue(
            Result.fail(new CategoriaInternaProtegidaError('cat-d', 'patron')),
          ),
      } as unknown as AprendizajeTransacciones['reclasificarConParecidos'],
    });
    const res = await request(probeApp({ execute: vi.fn() }, aprendizaje))
      .patch('/api/transacciones/tx-1/categoria')
      .send({
        categoriaId: 'cat-d',
        aplicarAParecidos: { periodo: '2026-07' },
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CATEGORIA_INTERNA');
  });

  it('with aplicarAParecidos: an unknown category keeps the plain 400', async () => {
    const aprendizaje = makeAprendizaje({
      reclasificarConParecidos: {
        execute: vi
          .fn()
          .mockResolvedValue(Result.fail(new CategoriaDesconocidaError('x'))),
      } as unknown as AprendizajeTransacciones['reclasificarConParecidos'],
    });
    const res = await request(probeApp({ execute: vi.fn() }, aprendizaje))
      .patch('/api/transacciones/tx-1/categoria')
      .send({ categoriaId: 'x', aplicarAParecidos: { periodo: '2026-07' } });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      message: 'La categoría indicada no existe en tu catálogo.',
    });
  });

  it('body con categoriaId no-string → se coacciona a "" (rechazo uniforme, delegado al writer)', async () => {
    const uc = {
      execute: vi
        .fn()
        .mockResolvedValue(Result.fail(new CategoriaDesconocidaError(''))),
    };
    await request(probeApp(uc))
      .patch('/api/transacciones/tx-1/categoria')
      .send({ categoriaId: 123 });

    expect(uc.execute).toHaveBeenCalledWith({
      userId: 'user-x',
      transaccionId: 'tx-1',
      categoriaId: '',
    });
  });

  it('body con la forma legacy { categoria: <nombre> } (sin categoriaId) → se coacciona a "" igual que un campo ausente (ADR-042, corte duro)', async () => {
    const uc = {
      execute: vi
        .fn()
        .mockResolvedValue(Result.fail(new CategoriaDesconocidaError(''))),
    };
    await request(probeApp(uc))
      .patch('/api/transacciones/tx-1/categoria')
      .send({ categoria: 'Supermercado' });

    expect(uc.execute).toHaveBeenCalledWith({
      userId: 'user-x',
      transaccionId: 'tx-1',
      categoriaId: '',
    });
  });

  it('400 con mensaje genérico si el categoriaId no existe en el catálogo del caller — ya NO enumera los 8 nombres', async () => {
    const uc = {
      execute: vi
        .fn()
        .mockResolvedValue(
          Result.fail(new CategoriaDesconocidaError('cat-hackeada')),
        ),
    };
    const res = await request(probeApp(uc))
      .patch('/api/transacciones/tx-1/categoria')
      .send({ categoriaId: 'cat-hackeada' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(
      'La categoría indicada no existe en tu catálogo.',
    );
    // Scrubbing: el input crudo nunca se refleja, y el mensaje ya no
    // enumera ningún nombre del catálogo (ni los del template ni ninguno).
    expect(JSON.stringify(res.body)).not.toContain('cat-hackeada');
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
      .send({ categoriaId: 'cat-supermercado-row-id' });

    expect(res.status).toBe(404);
  });

  it('500 ante error inesperado (rejection → error middleware)', async () => {
    const uc = { execute: vi.fn().mockRejectedValue(new Error('DB caída')) };
    const res = await request(probeApp(uc))
      .patch('/api/transacciones/tx-1/categoria')
      .send({ categoriaId: 'cat-supermercado-row-id' });

    expect(res.status).toBe(500);
  });
});

/**
 * `POST /api/transacciones/reevaluar` — re-corre los patrones de
 * clasificación del usuario sobre TODAS sus transacciones persistidas.
 * Sigue el mismo patrón `responderErrorTraducido`
 * que movimientos/categorías/patrones/ingesta (issue #507).
 */
type ReevaluarDoble = Pick<ReevaluarCategoriasUseCase, 'execute'>;

function probeReevaluarApp(uc: ReevaluarDoble): Express {
  const app = express();
  app.use(express.json());
  const router = express.Router();
  router.use((req, _res, next) => {
    req.userId = 'user-x';
    next();
  });
  registrarReevaluarCategorias(router, uc as ReevaluarCategoriasUseCase);
  app.use('/api', router);
  app.use(errorMiddleware);
  return app;
}

describe('registrarReevaluarCategorias — POST /api/transacciones/reevaluar', () => {
  it('200 con el DTO de conteos y llama con userId', async () => {
    const uc = {
      execute: vi.fn().mockResolvedValue(
        Result.ok({
          transaccionesEvaluadas: 10,
          transaccionesActualizadas: 3,
        }),
      ),
    };
    const res = await request(probeReevaluarApp(uc)).post(
      '/api/transacciones/reevaluar',
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      transaccionesEvaluadas: 10,
      transaccionesActualizadas: 3,
    });
    expect(uc.execute).toHaveBeenCalledWith({
      userId: 'user-x',
    });
  });

  it('500 cuando el catálogo o el writer fallan (CategorizacionFallidaError)', async () => {
    const uc = {
      execute: vi
        .fn()
        .mockResolvedValue(Result.fail(new CategorizacionFallidaError('boom'))),
    };
    const res = await request(probeReevaluarApp(uc)).post(
      '/api/transacciones/reevaluar',
    );

    expect(res.status).toBe(500);
  });

  it('500 ante error inesperado (rejection → error middleware)', async () => {
    const uc = { execute: vi.fn().mockRejectedValue(new Error('DB caída')) };
    const res = await request(probeReevaluarApp(uc)).post(
      '/api/transacciones/reevaluar',
    );

    expect(res.status).toBe(500);
  });
});

describe('registrarTransacciones — GET /api/transacciones/:id/parecidos (CLA-03, S6)', () => {
  it('200 with the suggested text, the count of other movements and existente', async () => {
    const aprendizaje = makeAprendizaje();
    const res = await request(probeApp({ execute: vi.fn() }, aprendizaje))
      .get('/api/transacciones/tx-1/parecidos')
      .query({ categoriaId: 'cat-1', periodo: '2026-07' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      patron: 'cabify',
      total: 3,
      existente: {
        patronId: 'pat-9',
        categoriaId: 'cat-auto',
        categoria: 'Auto',
        bucket: 'Necesidades',
      },
    });
    expect(aprendizaje.obtenerParecidos.execute).toHaveBeenCalledWith({
      userId: 'user-x',
      transaccionId: 'tx-1',
      categoriaId: 'cat-1',
      periodo: '2026-07',
    });
  });

  it('400 when categoriaId is missing', async () => {
    const aprendizaje = makeAprendizaje();
    const res = await request(probeApp({ execute: vi.fn() }, aprendizaje)).get(
      '/api/transacciones/tx-1/parecidos',
    );

    expect(res.status).toBe(400);
    expect(aprendizaje.obtenerParecidos.execute).not.toHaveBeenCalled();
  });

  it("404 TRANSACCION_NO_ENCONTRADA when the movement is not the caller's", async () => {
    const aprendizaje = makeAprendizaje({
      obtenerParecidos: {
        execute: vi
          .fn()
          .mockResolvedValue(
            Result.fail(new TransaccionNoEncontradaError('tx-x')),
          ),
      } as unknown as AprendizajeTransacciones['obtenerParecidos'],
    });
    const res = await request(probeApp({ execute: vi.fn() }, aprendizaje))
      .get('/api/transacciones/tx-x/parecidos')
      .query({ categoriaId: 'cat-1' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('TRANSACCION_NO_ENCONTRADA');
  });
});
