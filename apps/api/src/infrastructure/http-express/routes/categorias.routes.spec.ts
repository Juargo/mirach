import express, { type Express } from 'express';
import request from 'supertest';
import { registrarCategorias } from './categorias.routes';
import { errorMiddleware } from '../middleware/error.middleware';
import { Result } from '../../../shared/result';
import { Bucket } from '../../../domain/value-objects/bucket';
import { CatalogoDemoSoloLecturaError } from '../../../domain/errors/catalogo-demo-solo-lectura.error';
import { NombreCategoriaDuplicadoError } from '../../../domain/errors/nombre-categoria-duplicado.error';
import { CategoriaNoEncontradaError } from '../../../domain/errors/categoria-no-encontrada.error';
import { appLogger } from '../../logging/app-logger';
import type { CatalogoGraph } from '../../../composition/crear-catalogo';

const CATEGORIA_OK = {
  id: 'cat-1',
  nombre: 'Mascotas',
  bucket: Bucket.Deseos,
  patrones: [],
  transaccionesCount: 0,
};

function makeCatalogo(overrides?: Partial<CatalogoGraph>): CatalogoGraph {
  return {
    listarCatalogo: {
      execute: vi.fn().mockResolvedValue(Result.ok([CATEGORIA_OK])),
    },
    crearCategoria: {
      execute: vi.fn().mockResolvedValue(Result.ok(CATEGORIA_OK)),
    },
    actualizarCategoria: {
      execute: vi.fn().mockResolvedValue(Result.ok(CATEGORIA_OK)),
    },
    eliminarCategoria: {
      execute: vi.fn().mockResolvedValue(Result.ok(undefined)),
    },
    crearPatron: { execute: vi.fn() },
    actualizarPatron: { execute: vi.fn() },
    eliminarPatron: { execute: vi.fn() },
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
  registrarCategorias(router, catalogo);
  app.use('/api', router);
  app.use(errorMiddleware);
  return app;
}

describe('registrarCategorias', () => {
  describe('GET /api/categorias', () => {
    it('200 with the mapped catalog', async () => {
      const catalogo = makeCatalogo();
      const res = await request(probeApp(catalogo)).get('/api/categorias');

      expect(res.status).toBe(200);
      expect(res.body.categorias).toHaveLength(1);
      expect(catalogo.listarCatalogo.execute).toHaveBeenCalledWith({
        userId: 'user-x',
      });
    });
  });

  describe('POST /api/categorias', () => {
    it('201 with the created category', async () => {
      const catalogo = makeCatalogo();
      const res = await request(probeApp(catalogo))
        .post('/api/categorias')
        .send({ nombre: 'Mascotas', bucket: 'Deseos' });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('cat-1');
      expect(catalogo.crearCategoria.execute).toHaveBeenCalledWith({
        userId: 'user-x',
        esDemo: false,
        nombre: 'Mascotas',
        bucket: 'Deseos',
      });
    });

    it('threads req.esDemo into the use case input', async () => {
      const catalogo = makeCatalogo();
      await request(probeApp(catalogo, true))
        .post('/api/categorias')
        .send({ nombre: 'Mascotas', bucket: 'Deseos' });

      expect(catalogo.crearCategoria.execute).toHaveBeenCalledWith(
        expect.objectContaining({ esDemo: true }),
      );
    });

    it('400 BODY_INVALIDO on a malformed body, WITHOUT calling the use case or echoing the input', async () => {
      const catalogo = makeCatalogo();
      const res = await request(probeApp(catalogo))
        .post('/api/categorias')
        .send({ nombre: 123, hackerField: 'sneaky-value' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        message: 'Cuerpo de la petición inválido.',
        code: 'BODY_INVALIDO',
      });
      expect(catalogo.crearCategoria.execute).not.toHaveBeenCalled();
      expect(JSON.stringify(res.body)).not.toContain('sneaky-value');
    });

    it('403 DEMO_SOLO_LECTURA when the use case rejects a demo session', async () => {
      const catalogo = makeCatalogo({
        crearCategoria: {
          execute: vi
            .fn()
            .mockResolvedValue(Result.fail(new CatalogoDemoSoloLecturaError())),
        } as unknown as CatalogoGraph['crearCategoria'],
      });
      const res = await request(probeApp(catalogo))
        .post('/api/categorias')
        .send({ nombre: 'Mascotas', bucket: 'Deseos' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('DEMO_SOLO_LECTURA');
    });

    it('issue #507: req.esDemo undefined ⇒ fail-closed — el use case recibe esDemo: true, nunca undefined', async () => {
      const catalogo = makeCatalogo({
        crearCategoria: {
          execute: vi
            .fn()
            .mockResolvedValue(Result.fail(new CatalogoDemoSoloLecturaError())),
        } as unknown as CatalogoGraph['crearCategoria'],
      });
      const res = await request(probeApp(catalogo, 'unset'))
        .post('/api/categorias')
        .send({ nombre: 'Mascotas', bucket: 'Deseos' });

      expect(catalogo.crearCategoria.execute).toHaveBeenCalledWith(
        expect.objectContaining({ esDemo: true }),
      );
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('DEMO_SOLO_LECTURA');
    });

    it('issue #507 (ADR-033): un 403 DEMO_SOLO_LECTURA loguea el gate trip con { path }', async () => {
      const warnSpy = vi.spyOn(appLogger, 'warn').mockImplementation(() => {});
      const catalogo = makeCatalogo({
        crearCategoria: {
          execute: vi
            .fn()
            .mockResolvedValue(Result.fail(new CatalogoDemoSoloLecturaError())),
        } as unknown as CatalogoGraph['crearCategoria'],
      });
      await request(probeApp(catalogo))
        .post('/api/categorias')
        .send({ nombre: 'Mascotas', bucket: 'Deseos' });

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('DEMO'), {
        path: '/categorias',
      });
      warnSpy.mockRestore();
    });

    it('409 NOMBRE_DUPLICADO on a duplicate name', async () => {
      const catalogo = makeCatalogo({
        crearCategoria: {
          execute: vi
            .fn()
            .mockResolvedValue(
              Result.fail(new NombreCategoriaDuplicadoError('Mascotas')),
            ),
        } as unknown as CatalogoGraph['crearCategoria'],
      });
      const res = await request(probeApp(catalogo))
        .post('/api/categorias')
        .send({ nombre: 'Mascotas', bucket: 'Deseos' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('NOMBRE_DUPLICADO');
    });
  });

  describe('PATCH /api/categorias/:id', () => {
    it('200 with the updated category, partial body accepted', async () => {
      const catalogo = makeCatalogo();
      const res = await request(probeApp(catalogo))
        .patch('/api/categorias/cat-1')
        .send({ nombre: 'Renombrada' });

      expect(res.status).toBe(200);
      expect(catalogo.actualizarCategoria.execute).toHaveBeenCalledWith({
        userId: 'user-x',
        esDemo: false,
        id: 'cat-1',
        nombre: 'Renombrada',
        bucket: undefined,
      });
    });

    it('400 BODY_INVALIDO on an empty body (Q4)', async () => {
      const catalogo = makeCatalogo();
      const res = await request(probeApp(catalogo))
        .patch('/api/categorias/cat-1')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('BODY_INVALIDO');
      expect(catalogo.actualizarCategoria.execute).not.toHaveBeenCalled();
    });

    it('404 CATEGORIA_NO_ENCONTRADA — merges absent and not-yours', async () => {
      const catalogo = makeCatalogo({
        actualizarCategoria: {
          execute: vi
            .fn()
            .mockResolvedValue(
              Result.fail(new CategoriaNoEncontradaError('cat-x')),
            ),
        } as unknown as CatalogoGraph['actualizarCategoria'],
      });
      const res = await request(probeApp(catalogo))
        .patch('/api/categorias/cat-x')
        .send({ nombre: 'x' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('CATEGORIA_NO_ENCONTRADA');
    });

    it('issue #507: req.esDemo undefined ⇒ fail-closed — el use case recibe esDemo: true, nunca undefined', async () => {
      const catalogo = makeCatalogo({
        actualizarCategoria: {
          execute: vi
            .fn()
            .mockResolvedValue(Result.fail(new CatalogoDemoSoloLecturaError())),
        } as unknown as CatalogoGraph['actualizarCategoria'],
      });
      const res = await request(probeApp(catalogo, 'unset'))
        .patch('/api/categorias/cat-1')
        .send({ nombre: 'Renombrada' });

      expect(catalogo.actualizarCategoria.execute).toHaveBeenCalledWith(
        expect.objectContaining({ esDemo: true }),
      );
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('DEMO_SOLO_LECTURA');
    });
  });

  describe('DELETE /api/categorias/:id', () => {
    it('204 with no body on success', async () => {
      const catalogo = makeCatalogo();
      const res = await request(probeApp(catalogo)).delete(
        '/api/categorias/cat-1',
      );

      expect(res.status).toBe(204);
      expect(res.body).toEqual({});
      expect(catalogo.eliminarCategoria.execute).toHaveBeenCalledWith({
        userId: 'user-x',
        esDemo: false,
        id: 'cat-1',
      });
    });

    it('404 CATEGORIA_NO_ENCONTRADA when the use case fails — the delete error path (US-039, no more 409)', async () => {
      const catalogo = makeCatalogo({
        eliminarCategoria: {
          execute: vi
            .fn()
            .mockResolvedValue(
              Result.fail(new CategoriaNoEncontradaError('cat-1')),
            ),
        } as unknown as CatalogoGraph['eliminarCategoria'],
      });
      const res = await request(probeApp(catalogo)).delete(
        '/api/categorias/cat-1',
      );

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('CATEGORIA_NO_ENCONTRADA');
    });

    it('issue #507: req.esDemo undefined ⇒ fail-closed — el use case recibe esDemo: true, nunca undefined', async () => {
      const catalogo = makeCatalogo({
        eliminarCategoria: {
          execute: vi
            .fn()
            .mockResolvedValue(Result.fail(new CatalogoDemoSoloLecturaError())),
        } as unknown as CatalogoGraph['eliminarCategoria'],
      });
      const res = await request(probeApp(catalogo, 'unset')).delete(
        '/api/categorias/cat-1',
      );

      expect(catalogo.eliminarCategoria.execute).toHaveBeenCalledWith(
        expect.objectContaining({ esDemo: true }),
      );
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('DEMO_SOLO_LECTURA');
    });
  });
});
