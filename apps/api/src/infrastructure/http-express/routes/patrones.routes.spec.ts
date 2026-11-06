import { CategoriaInternaProtegidaError } from '../../../domain/errors/categoria-interna-protegida.error';
import express, { type Express } from 'express';
import request from 'supertest';
import { registrarPatrones } from './patrones.routes';
import { errorMiddleware } from '../middleware/error.middleware';
import { Result } from '../../../shared/result';
import { CategoriaNoEncontradaError } from '../../../domain/errors/categoria-no-encontrada.error';
import { PatronNoEncontradoError } from '../../../domain/errors/patron-no-encontrado.error';
import { PatronDuplicadoError } from '../../../domain/errors/patron-duplicado.error';
import { PeriodoInvalidoError } from '../../../domain/errors/periodo-invalido.error';
import type { CatalogoGraph } from '../../../composition/crear-catalogo';

const PATRON_OK = {
  id: 'pat-1',
  categoriaId: 'cat-1',
  patron: 'netflix',
  matchType: 'CONTAINS' as const,
  prioridad: 100,
};

const VISTA_PREVIA_OK = {
  periodo: '2026-07',
  patron: 'cabify',
  coincidencias: [
    {
      id: 'tx-1',
      fecha: new Date('2026-07-10T00:00:00.000Z'),
      descripcion: 'MERPAGO*CABIFY 123',
      cargo: 4500n,
      abono: 0n,
      categoriaIdActual: 'cat-otra',
      clasificacionManual: false,
    },
  ],
  existente: {
    patronId: 'pat-9',
    categoriaId: 'cat-auto',
    categoria: 'Auto',
    bucket: 'Necesidades',
  },
};

function makeCatalogo(overrides?: Partial<CatalogoGraph>): CatalogoGraph {
  return {
    listarCatalogo: { execute: vi.fn() },
    crearCategoria: { execute: vi.fn() },
    actualizarCategoria: { execute: vi.fn() },
    eliminarCategoria: { execute: vi.fn() },
    crearPatron: {
      execute: vi
        .fn()
        .mockResolvedValue(Result.ok({ patron: PATRON_OK, movidos: 0 })),
    },
    actualizarPatron: {
      execute: vi.fn().mockResolvedValue(Result.ok(PATRON_OK)),
    },
    eliminarPatron: {
      execute: vi.fn().mockResolvedValue(Result.ok(undefined)),
    },
    vistaPreviaPatron: {
      execute: vi.fn().mockResolvedValue(Result.ok(VISTA_PREVIA_OK)),
    },
    ...overrides,
  } as unknown as CatalogoGraph;
}

function probeApp(catalogo: CatalogoGraph): Express {
  const app = express();
  app.use(express.json());
  const router = express.Router();
  router.use((req, _res, next) => {
    req.userId = 'user-x';
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
      // Previous body, plus `movidos: 0` (S4: without the periodo nothing moves).
      expect(res.body).toEqual({ ...PATRON_OK, movidos: 0 });
      expect(catalogo.crearPatron.execute).toHaveBeenCalledWith({
        userId: 'user-x',
        categoriaId: 'cat-1',
        patron: 'netflix',
        matchType: 'CONTAINS',
        prioridad: undefined,
        moverDelPeriodo: undefined,
      });
    });

    it('201 with movidos when moverDelPeriodo is sent (CLA-15, S4)', async () => {
      const catalogo = makeCatalogo({
        crearPatron: {
          execute: vi
            .fn()
            .mockResolvedValue(Result.ok({ patron: PATRON_OK, movidos: 3 })),
        } as unknown as CatalogoGraph['crearPatron'],
      });
      const res = await request(probeApp(catalogo)).post('/api/patrones').send({
        categoriaId: 'cat-1',
        patron: 'netflix',
        matchType: 'CONTAINS',
        moverDelPeriodo: '2026-07',
      });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ ...PATRON_OK, movidos: 3 });
      expect(catalogo.crearPatron.execute).toHaveBeenCalledWith(
        expect.objectContaining({ moverDelPeriodo: '2026-07' }),
      );
    });

    it('409 PATRON_DUPLICADO carries existente: the pattern and its category (CLA-17)', async () => {
      const catalogo = makeCatalogo({
        crearPatron: {
          execute: vi.fn().mockResolvedValue(
            Result.fail(
              new PatronDuplicadoError('cafe', {
                patronId: 'pat-9',
                categoriaId: 'cat-cafes',
                categoria: 'Cafés',
                bucket: 'Deseos' as never,
              }),
            ),
          ),
        } as unknown as CatalogoGraph['crearPatron'],
      });
      const res = await request(probeApp(catalogo)).post('/api/patrones').send({
        categoriaId: 'cat-1',
        patron: 'cafe',
        matchType: 'CONTAINS',
      });

      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        message: 'Ya existe un patrón con ese texto.',
        code: 'PATRON_DUPLICADO',
        existente: {
          patronId: 'pat-9',
          categoriaId: 'cat-cafes',
          categoria: 'Cafés',
          bucket: 'Deseos',
        },
      });
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

    it('403 CATEGORIA_INTERNA when the category is internal (CLA-18)', async () => {
      const catalogo = makeCatalogo({
        crearPatron: {
          execute: vi
            .fn()
            .mockResolvedValue(
              Result.fail(
                new CategoriaInternaProtegidaError('cat-d', 'patron'),
              ),
            ),
        } as unknown as CatalogoGraph['crearPatron'],
      });
      const res = await request(probeApp(catalogo)).post('/api/patrones').send({
        categoriaId: 'cat-d',
        patron: 'netflix',
        matchType: 'CONTAINS',
      });

      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        message: 'Esta categoría es interna del sistema: no acepta patrones.',
        code: 'CATEGORIA_INTERNA',
      });
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

  describe('POST /api/patrones/vista-previa (CLA-15, S3)', () => {
    it('200 with periodo, normalized patron, total, coincidencias and existente', async () => {
      const catalogo = makeCatalogo();
      const res = await request(probeApp(catalogo))
        .post('/api/patrones/vista-previa')
        .send({ categoriaId: 'cat-1', patron: 'Cabify', periodo: '2026-07' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        periodo: '2026-07',
        patron: 'cabify',
        total: 1,
        coincidencias: [
          {
            id: 'tx-1',
            descripcion: 'MERPAGO*CABIFY 123',
            fecha: '2026-07-10T00:00:00.000Z',
            monto: '4500',
          },
        ],
        existente: {
          patronId: 'pat-9',
          categoriaId: 'cat-auto',
          categoria: 'Auto',
          bucket: 'Necesidades',
        },
      });
      expect(catalogo.vistaPreviaPatron.execute).toHaveBeenCalledWith({
        userId: 'user-x',
        categoriaId: 'cat-1',
        patron: 'Cabify',
        periodo: '2026-07',
      });
    });

    it('400 BODY_INVALIDO on an unknown field, without calling the use case', async () => {
      const catalogo = makeCatalogo();
      const res = await request(probeApp(catalogo))
        .post('/api/patrones/vista-previa')
        .send({ categoriaId: 'cat-1', patron: 'cabify', matchType: 'REGEX' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('BODY_INVALIDO');
      expect(catalogo.vistaPreviaPatron.execute).not.toHaveBeenCalled();
    });

    it('404 CATEGORIA_NO_ENCONTRADA, like creating a pattern', async () => {
      const catalogo = makeCatalogo({
        vistaPreviaPatron: {
          execute: vi
            .fn()
            .mockResolvedValue(
              Result.fail(new CategoriaNoEncontradaError('cat-x')),
            ),
        } as unknown as CatalogoGraph['vistaPreviaPatron'],
      });
      const res = await request(probeApp(catalogo))
        .post('/api/patrones/vista-previa')
        .send({ categoriaId: 'cat-x', patron: 'cabify' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('CATEGORIA_NO_ENCONTRADA');
    });

    it('400 PERIODO_INVALIDO on a malformed periodo', async () => {
      const catalogo = makeCatalogo({
        vistaPreviaPatron: {
          execute: vi
            .fn()
            .mockResolvedValue(
              Result.fail(new PeriodoInvalidoError('2026-13')),
            ),
        } as unknown as CatalogoGraph['vistaPreviaPatron'],
      });
      const res = await request(probeApp(catalogo))
        .post('/api/patrones/vista-previa')
        .send({ categoriaId: 'cat-1', patron: 'cabify', periodo: '2026-13' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PERIODO_INVALIDO');
      expect(JSON.stringify(res.body)).not.toContain('2026-13');
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
        id: 'pat-1',
        patron: undefined,
        matchType: undefined,
        prioridad: 5,
        categoriaId: undefined,
      });
    });

    it('accepts categoriaId to move the pattern (CLA-17, S5)', async () => {
      const catalogo = makeCatalogo();
      const res = await request(probeApp(catalogo))
        .patch('/api/patrones/pat-1')
        .send({ categoriaId: 'cat-2' });

      expect(res.status).toBe(200);
      expect(catalogo.actualizarPatron.execute).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'pat-1', categoriaId: 'cat-2' }),
      );
    });

    it('400 BODY_INVALIDO on an unknown field (.strict())', async () => {
      const catalogo = makeCatalogo();
      const res = await request(probeApp(catalogo))
        .patch('/api/patrones/pat-1')
        .send({ bucket: 'Ahorro' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('BODY_INVALIDO');
      expect(catalogo.actualizarPatron.execute).not.toHaveBeenCalled();
    });

    it('400 BODY_INVALIDO on an empty body', async () => {
      const catalogo = makeCatalogo();
      const res = await request(probeApp(catalogo))
        .patch('/api/patrones/pat-1')
        .send({});

      expect(res.status).toBe(400);
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
  });
});
