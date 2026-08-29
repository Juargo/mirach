import express, { type Express } from 'express';
import request from 'supertest';
import { registrarPatrones } from './patrones.routes';
import { errorMiddleware } from '../middleware/error.middleware';
import { Result } from '../../../shared/result';
import { CatalogoDemoSoloLecturaError } from '../../../domain/errors/catalogo-demo-solo-lectura.error';
import { CategoriaNoEncontradaError } from '../../../domain/errors/categoria-no-encontrada.error';
import { PatronNoEncontradoError } from '../../../domain/errors/patron-no-encontrado.error';
import { PatronDuplicadoError } from '../../../domain/errors/patron-duplicado.error';
import { appLogger } from '../../logging/app-logger';
import type { CatalogoGraph } from '../../../composition/crear-catalogo';

const PATRON_OK = {
  id: 'pat-1',
  categoriaId: 'cat-1',
  patron: 'netflix',
  matchType: 'CONTAINS' as const,
  prioridad: 100,
};

function makeCatalogo(overrides?: Partial<CatalogoGraph>): CatalogoGraph {
  return {
    listarCatalogo: { execute: vi.fn() },
    crearCategoria: { execute: vi.fn() },
    actualizarCategoria: { execute: vi.fn() },
    eliminarCategoria: { execute: vi.fn() },
    crearPatron: { execute: vi.fn().mockResolvedValue(Result.ok(PATRON_OK)) },
    actualizarPatron: {
      execute: vi.fn().mockResolvedValue(Result.ok(PATRON_OK)),
    },
    eliminarPatron: {
      execute: vi.fn().mockResolvedValue(Result.ok(undefined)),
    },
    ...overrides,
  } as unknown as CatalogoGraph;
}

/** `esDemo: 'unset'` (issue #507) deja `req.esDemo` SIN asignar — simula una
 * request que llegó al handler sin pasar por `sessionMiddleware`. */
function probeApp(
  catalogo: CatalogoGraph,
  esDemo: boolean | 'unset' = false,
): Express {
  const app = express();
  app.use(express.json());
  const router = express.Router();
  router.use((req, _res, next) => {
    req.userId = 'user-x';
    if (esDemo !== 'unset') {
      req.esDemo = esDemo;
    }
    next();
  });
  registrarPatrones(router, catalogo);
  app.use('/api', router);
  app.use(errorMiddleware);
  return app;
}

describe('registrarPatrones', () => {
  describe('POST /api/patrones', () => {
    it('201 with the created pattern', async () => {
      const catalogo = makeCatalogo();
      const res = await request(probeApp(catalogo)).post('/api/patrones').send({
        categoriaId: 'cat-1',
        patron: 'netflix',
        matchType: 'CONTAINS',
      });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('pat-1');
      expect(catalogo.crearPatron.execute).toHaveBeenCalledWith({
        userId: 'user-x',
        esDemo: false,
        categoriaId: 'cat-1',
        patron: 'netflix',
        matchType: 'CONTAINS',
        prioridad: undefined,
      });
    });

    it('threads req.esDemo into the use case input', async () => {
      const catalogo = makeCatalogo();
      await request(probeApp(catalogo, true)).post('/api/patrones').send({
        categoriaId: 'cat-1',
        patron: 'netflix',
        matchType: 'CONTAINS',
      });

      expect(catalogo.crearPatron.execute).toHaveBeenCalledWith(
        expect.objectContaining({ esDemo: true }),
      );
    });

    it('400 BODY_INVALIDO on a malformed body, WITHOUT calling the use case or echoing the input', async () => {
      const catalogo = makeCatalogo();
      const res = await request(probeApp(catalogo)).post('/api/patrones').send({
        categoriaId: 'cat-1',
        patron: 'netflix',
        hackerField: 'sneaky-value',
      });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        message: 'Cuerpo de la petición inválido.',
        code: 'BODY_INVALIDO',
      });
      expect(catalogo.crearPatron.execute).not.toHaveBeenCalled();
      expect(JSON.stringify(res.body)).not.toContain('sneaky-value');
    });

    it('403 DEMO_SOLO_LECTURA when the use case rejects a demo session', async () => {
      const catalogo = makeCatalogo({
        crearPatron: {
          execute: vi
            .fn()
            .mockResolvedValue(Result.fail(new CatalogoDemoSoloLecturaError())),
        } as unknown as CatalogoGraph['crearPatron'],
      });
      const res = await request(probeApp(catalogo)).post('/api/patrones').send({
        categoriaId: 'cat-1',
        patron: 'netflix',
        matchType: 'CONTAINS',
      });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('DEMO_SOLO_LECTURA');
    });

    it('issue #507: req.esDemo undefined ⇒ fail-closed — el use case recibe esDemo: true, nunca undefined', async () => {
      const catalogo = makeCatalogo({
        crearPatron: {
          execute: vi
            .fn()
            .mockResolvedValue(Result.fail(new CatalogoDemoSoloLecturaError())),
        } as unknown as CatalogoGraph['crearPatron'],
      });
      const res = await request(probeApp(catalogo, 'unset'))
        .post('/api/patrones')
        .send({
          categoriaId: 'cat-1',
          patron: 'netflix',
          matchType: 'CONTAINS',
        });

      expect(catalogo.crearPatron.execute).toHaveBeenCalledWith(
        expect.objectContaining({ esDemo: true }),
      );
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('DEMO_SOLO_LECTURA');
    });

    it('issue #507 (ADR-033): un 403 DEMO_SOLO_LECTURA loguea el gate trip con { path }', async () => {
      const warnSpy = vi.spyOn(appLogger, 'warn').mockImplementation(() => {});
      const catalogo = makeCatalogo({
        crearPatron: {
          execute: vi
            .fn()
            .mockResolvedValue(Result.fail(new CatalogoDemoSoloLecturaError())),
        } as unknown as CatalogoGraph['crearPatron'],
      });
      await request(probeApp(catalogo)).post('/api/patrones').send({
        categoriaId: 'cat-1',
        patron: 'netflix',
        matchType: 'CONTAINS',
      });

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('DEMO'), {
        path: '/patrones',
      });
      warnSpy.mockRestore();
    });

    it('404 CATEGORIA_NO_ENCONTRADA when the categoriaId is foreign or absent', async () => {
      const catalogo = makeCatalogo({
        crearPatron: {
          execute: vi
            .fn()
            .mockResolvedValue(
              Result.fail(new CategoriaNoEncontradaError('cat-x')),
            ),
        } as unknown as CatalogoGraph['crearPatron'],
      });
      const res = await request(probeApp(catalogo)).post('/api/patrones').send({
        categoriaId: 'cat-x',
        patron: 'netflix',
        matchType: 'CONTAINS',
      });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('CATEGORIA_NO_ENCONTRADA');
    });

    it('409 PATRON_DUPLICADO on a duplicate pattern', async () => {
      const catalogo = makeCatalogo({
        crearPatron: {
          execute: vi
            .fn()
            .mockResolvedValue(
              Result.fail(new PatronDuplicadoError('netflix')),
            ),
        } as unknown as CatalogoGraph['crearPatron'],
      });
      const res = await request(probeApp(catalogo)).post('/api/patrones').send({
        categoriaId: 'cat-1',
        patron: 'netflix',
        matchType: 'CONTAINS',
      });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PATRON_DUPLICADO');
    });
  });

  describe('PATCH /api/patrones/:id', () => {
    it('200 with the updated pattern, partial body accepted', async () => {
      const catalogo = makeCatalogo();
      const res = await request(probeApp(catalogo))
        .patch('/api/patrones/pat-1')
        .send({ prioridad: 5 });

      expect(res.status).toBe(200);
      expect(catalogo.actualizarPatron.execute).toHaveBeenCalledWith({
        userId: 'user-x',
        esDemo: false,
        id: 'pat-1',
        patron: undefined,
        matchType: undefined,
        prioridad: 5,
      });
    });

    it('400 BODY_INVALIDO when categoriaId is sent (non-goal, .strict() rejects it)', async () => {
      const catalogo = makeCatalogo();
      const res = await request(probeApp(catalogo))
        .patch('/api/patrones/pat-1')
        .send({ categoriaId: 'cat-2' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('BODY_INVALIDO');
      expect(catalogo.actualizarPatron.execute).not.toHaveBeenCalled();
    });

    it('404 PATRON_NO_ENCONTRADO — merges absent and not-yours', async () => {
      const catalogo = makeCatalogo({
        actualizarPatron: {
          execute: vi
            .fn()
            .mockResolvedValue(
              Result.fail(new PatronNoEncontradoError('pat-x')),
            ),
        } as unknown as CatalogoGraph['actualizarPatron'],
      });
      const res = await request(probeApp(catalogo))
        .patch('/api/patrones/pat-x')
        .send({ prioridad: 5 });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('PATRON_NO_ENCONTRADO');
    });

    it('issue #507: req.esDemo undefined ⇒ fail-closed — el use case recibe esDemo: true, nunca undefined', async () => {
      const catalogo = makeCatalogo({
        actualizarPatron: {
          execute: vi
            .fn()
            .mockResolvedValue(Result.fail(new CatalogoDemoSoloLecturaError())),
        } as unknown as CatalogoGraph['actualizarPatron'],
      });
      const res = await request(probeApp(catalogo, 'unset'))
        .patch('/api/patrones/pat-1')
        .send({ prioridad: 5 });

      expect(catalogo.actualizarPatron.execute).toHaveBeenCalledWith(
        expect.objectContaining({ esDemo: true }),
      );
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('DEMO_SOLO_LECTURA');
    });
  });

  describe('DELETE /api/patrones/:id', () => {
    it('204 with no body on success', async () => {
      const catalogo = makeCatalogo();
      const res = await request(probeApp(catalogo)).delete(
        '/api/patrones/pat-1',
      );

      expect(res.status).toBe(204);
      expect(res.body).toEqual({});
      expect(catalogo.eliminarPatron.execute).toHaveBeenCalledWith({
        userId: 'user-x',
        esDemo: false,
        id: 'pat-1',
      });
    });

    it('404 PATRON_NO_ENCONTRADO', async () => {
      const catalogo = makeCatalogo({
        eliminarPatron: {
          execute: vi
            .fn()
            .mockResolvedValue(
              Result.fail(new PatronNoEncontradoError('pat-x')),
            ),
        } as unknown as CatalogoGraph['eliminarPatron'],
      });
      const res = await request(probeApp(catalogo)).delete(
        '/api/patrones/pat-x',
      );

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('PATRON_NO_ENCONTRADO');
    });

    it('issue #507: req.esDemo undefined ⇒ fail-closed — el use case recibe esDemo: true, nunca undefined', async () => {
      const catalogo = makeCatalogo({
        eliminarPatron: {
          execute: vi
            .fn()
            .mockResolvedValue(Result.fail(new CatalogoDemoSoloLecturaError())),
        } as unknown as CatalogoGraph['eliminarPatron'],
      });
      const res = await request(probeApp(catalogo, 'unset')).delete(
        '/api/patrones/pat-1',
      );

      expect(catalogo.eliminarPatron.execute).toHaveBeenCalledWith(
        expect.objectContaining({ esDemo: true }),
      );
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('DEMO_SOLO_LECTURA');
    });
  });
});
