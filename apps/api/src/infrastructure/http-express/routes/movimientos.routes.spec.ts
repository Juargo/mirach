import express, { type Express } from 'express';
import request from 'supertest';
import {
  registrarMovimientos,
  registrarMovimientoManual,
  registrarEliminarMovimientoManual,
} from './movimientos.routes';
import { errorMiddleware } from '../middleware/error.middleware';
import { Result } from '../../../shared/result';
import { PeriodoInvalidoError } from '../../../domain/errors/periodo-invalido.error';
import { MovimientoManualInvalidoError } from '../../../domain/errors/movimiento-manual-invalido.error';
import { CategoriaFueraDeCatalogoError } from '../../../domain/errors/categoria-fuera-de-catalogo.error';
import { BucketCategoriaNoConcuerdaError } from '../../../domain/errors/bucket-categoria-no-concuerda.error';
import { PersistenciaFallidaError } from '../../../domain/errors/persistencia-fallida.error';
import { TransaccionNoEncontradaError } from '../../../domain/errors/transaccion-no-encontrada.error';
import { MovimientoDemoSoloLecturaError } from '../../../domain/errors/movimiento-demo-solo-lectura.error';
import { MovimientoManual } from '../../../domain/value-objects/movimiento-manual';
import { Bucket } from '../../../domain/value-objects/bucket';
import type { ObtenerMovimientosMesUseCase } from '../../../application/use-cases/obtener-movimientos-mes.use-case';
import type { RegistrarMovimientoManualUseCase } from '../../../application/use-cases/registrar-movimiento-manual.use-case';
import type { EliminarMovimientoManualUseCase } from '../../../application/use-cases/eliminar-movimiento-manual.use-case';

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

// ---------------------------------------------------------------------------
// Helpers for POST /api/movimientos tests
// ---------------------------------------------------------------------------

type RegistrarDoble = Pick<RegistrarMovimientoManualUseCase, 'execute'>;

function makeManualVo(tipo: 'Ingreso' | 'Gasto' = 'Ingreso'): MovimientoManual {
  const result = MovimientoManual.crear({
    tipo,
    fecha: new Date('2026-08-10'),
    descripcion: tipo === 'Ingreso' ? 'Reembolso caja chica' : 'Feria',
    monto: tipo === 'Ingreso' ? '45000' : '12990',
    clock: () => new Date('2026-08-10'),
  });
  if (result.isFail()) throw new Error('unexpected VO failure in test fixture');
  return result.getValue();
}

function probePostApp(uc: RegistrarDoble): Express {
  const app = express();
  app.use(express.json());
  const router = express.Router();
  router.use((req, _res, next) => {
    req.userId = 'user-x';
    next();
  });
  registrarMovimientoManual(router, uc as RegistrarMovimientoManualUseCase);
  app.use('/api', router);
  app.use(errorMiddleware);
  return app;
}

describe('registrarMovimientoManual — POST /api/movimientos', () => {
  describe('201 happy paths', () => {
    it('201 Ingreso — returns full DTO body with origen:Manual and money as strings', async () => {
      const vo = makeManualVo('Ingreso');
      const uc: RegistrarDoble = {
        execute: vi
          .fn()
          .mockResolvedValue(Result.ok({ id: 'tx-ingreso-1', vo })),
      };
      const res = await request(probePostApp(uc))
        .post('/api/movimientos')
        .send({
          tipo: 'Ingreso',
          fecha: '2026-08-10',
          descripcion: 'Reembolso caja chica',
          monto: '45000',
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('tx-ingreso-1');
      expect(res.body.origen).toBe('Manual');
      expect(res.body.bucket).toBe('Ingreso');
      expect(res.body.categoriaId).toBeNull();
      expect(res.body.abono).toBe('45000');
      expect(res.body.cargo).toBe('0');
      expect(typeof res.body.abono).toBe('string'); // BigInt-safe — never a JS number
    });

    it('201 Gasto — returns full DTO body with caller-supplied bucket and categoriaId', async () => {
      const vo = makeManualVo('Gasto');
      const uc: RegistrarDoble = {
        execute: vi.fn().mockResolvedValue(Result.ok({ id: 'tx-gasto-1', vo })),
      };
      const res = await request(probePostApp(uc))
        .post('/api/movimientos')
        .send({
          tipo: 'Gasto',
          fecha: '2026-08-10',
          descripcion: 'Feria',
          monto: '12990',
          bucket: 'Deseos',
          categoriaId: 'cat-deseos-1',
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('tx-gasto-1');
      expect(res.body.origen).toBe('Manual');
      expect(res.body.bucket).toBe('Deseos');
      expect(res.body.categoriaId).toBe('cat-deseos-1');
      expect(res.body.cargo).toBe('12990');
      expect(res.body.abono).toBe('0');
    });
  });

  describe('400 domain errors — scrubbed (ADR-013)', () => {
    it('400 on MovimientoManualInvalidoError — response body contains no raw amounts', async () => {
      const uc: RegistrarDoble = {
        execute: vi
          .fn()
          .mockResolvedValue(
            Result.fail(new MovimientoManualInvalidoError('FECHA_FUTURA')),
          ),
      };
      const res = await request(probePostApp(uc))
        .post('/api/movimientos')
        .send({
          tipo: 'Ingreso',
          fecha: '2099-01-01',
          descripcion: 'Test futuro',
          monto: '99999',
        });

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).not.toContain('99999');
    });

    it('400 on CategoriaFueraDeCatalogoError — response body contains no categoriaId', async () => {
      const uc: RegistrarDoble = {
        execute: vi
          .fn()
          .mockResolvedValue(
            Result.fail(new CategoriaFueraDeCatalogoError('cat-otro-usuario')),
          ),
      };
      const res = await request(probePostApp(uc))
        .post('/api/movimientos')
        .send({
          tipo: 'Gasto',
          fecha: '2026-08-10',
          descripcion: 'Feria',
          monto: '12990',
          bucket: 'Deseos',
          categoriaId: 'cat-otro-usuario',
        });

      expect(res.status).toBe(400);
      // The categoriaId must NOT appear in the error response body (ADR-013)
      expect(JSON.stringify(res.body)).not.toContain('cat-otro-usuario');
    });

    it('400 on BucketCategoriaNoConcuerdaError — response body carries no raw fields', async () => {
      const uc: RegistrarDoble = {
        execute: vi
          .fn()
          .mockResolvedValue(
            Result.fail(
              new BucketCategoriaNoConcuerdaError('cat-1', Bucket.Deseos),
            ),
          ),
      };
      const res = await request(probePostApp(uc))
        .post('/api/movimientos')
        .send({
          tipo: 'Gasto',
          fecha: '2026-08-10',
          descripcion: 'Feria',
          monto: '12990',
          bucket: 'Necesidades',
          categoriaId: 'cat-1',
        });

      expect(res.status).toBe(400);
      // Neither the categoriaId nor the monto must appear in the error response (ADR-013 scrub)
      expect(JSON.stringify(res.body)).not.toContain('cat-1');
      expect(JSON.stringify(res.body)).not.toContain('12990');
    });
  });

  describe('500 infrastructure error', () => {
    it('500 on PersistenciaFallidaError', async () => {
      const uc: RegistrarDoble = {
        execute: vi
          .fn()
          .mockResolvedValue(
            Result.fail(new PersistenciaFallidaError('sentinel upsert failed')),
          ),
      };
      const res = await request(probePostApp(uc))
        .post('/api/movimientos')
        .send({
          tipo: 'Ingreso',
          fecha: '2026-08-10',
          descripcion: 'Reembolso',
          monto: '45000',
        });

      expect(res.status).toBe(500);
    });
  });

  describe('400 on Zod shape failure', () => {
    it('400 when Ingreso body carries stray bucket field (.strict() enforcement)', async () => {
      const uc: RegistrarDoble = { execute: vi.fn() };
      const res = await request(probePostApp(uc))
        .post('/api/movimientos')
        .send({
          tipo: 'Ingreso',
          fecha: '2026-08-10',
          descripcion: 'Sueldo',
          monto: '1000000',
          bucket: 'Deseos', // stray — Ingreso is strict
        });

      expect(res.status).toBe(400);
      expect(uc.execute).not.toHaveBeenCalled();
    });
  });

  describe('ISO-01 — userId always comes from the session, never from the body', () => {
    it('uses req.userId from session middleware even if the body contains a different userId (Gasto variant)', async () => {
      // The Gasto variant uses Zod's default strip mode, so an unknown `userId`
      // field is discarded from `parsed.data`; the route uses `req.userId` from
      // the session middleware regardless. This proves the route never reads userId
      // from the body.
      const vo = makeManualVo('Gasto');
      const uc: RegistrarDoble = {
        execute: vi.fn().mockResolvedValue(Result.ok({ id: 'tx-iso-1', vo })),
      };
      await request(probePostApp(uc)).post('/api/movimientos').send({
        tipo: 'Gasto',
        fecha: '2026-08-10',
        descripcion: 'Feria',
        monto: '12990',
        bucket: 'Deseos',
        categoriaId: 'cat-deseos-1',
        userId: 'attacker-user-id', // stray body field — must be ignored by the route
      });

      // The use case must have been called with the session userId, not the body one.
      expect(uc.execute).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-x' }),
      );
      expect(uc.execute).not.toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'attacker-user-id' }),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Helpers for DELETE /api/movimientos/:id tests
// ---------------------------------------------------------------------------

type EliminarDoble = Pick<EliminarMovimientoManualUseCase, 'execute'>;

function probeDeleteApp(uc: EliminarDoble, esDemo = false): Express {
  const app = express();
  const router = express.Router();
  router.use((req, _res, next) => {
    req.userId = 'user-x';
    req.esDemo = esDemo;
    next();
  });
  registrarEliminarMovimientoManual(
    router,
    uc as EliminarMovimientoManualUseCase,
  );
  app.use('/api', router);
  app.use(errorMiddleware);
  return app;
}

describe('registrarEliminarMovimientoManual — DELETE /api/movimientos/:id', () => {
  it('DEL-01: 204 on success, calls the use case with userId + esDemo + transaccionId', async () => {
    const uc: EliminarDoble = {
      execute: vi.fn().mockResolvedValue(Result.ok(undefined)),
    };
    const res = await request(probeDeleteApp(uc)).delete(
      '/api/movimientos/tx-1',
    );

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
    expect(uc.execute).toHaveBeenCalledWith({
      userId: 'user-x',
      esDemo: false,
      transaccionId: 'tx-1',
    });
  });

  it('DEL-03: 403 DEMO_SOLO_LECTURA on MovimientoDemoSoloLecturaError, routed through responderErrorTraducido', async () => {
    const uc: EliminarDoble = {
      execute: vi
        .fn()
        .mockResolvedValue(Result.fail(new MovimientoDemoSoloLecturaError())),
    };
    const res = await request(probeDeleteApp(uc, true)).delete(
      '/api/movimientos/tx-1',
    );

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DEMO_SOLO_LECTURA');
  });

  it('DEL-02: 404 merged anti-enumeration shape on TransaccionNoEncontradaError', async () => {
    const uc: EliminarDoble = {
      execute: vi
        .fn()
        .mockResolvedValue(
          Result.fail(new TransaccionNoEncontradaError('tx-ajena')),
        ),
    };
    const res = await request(probeDeleteApp(uc)).delete(
      '/api/movimientos/tx-ajena',
    );

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      message:
        'La transacción no existe o no pertenece al usuario autenticado.',
    });
  });

  it('req.userId from session middleware, never from the path', async () => {
    const uc: EliminarDoble = {
      execute: vi.fn().mockResolvedValue(Result.ok(undefined)),
    };
    await request(probeDeleteApp(uc)).delete('/api/movimientos/tx-1');

    expect(uc.execute).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-x' }),
    );
  });

  it('500 ante error inesperado (rejection → error middleware)', async () => {
    const uc: EliminarDoble = {
      execute: vi.fn().mockRejectedValue(new Error('DB caída')),
    };
    const res = await request(probeDeleteApp(uc)).delete(
      '/api/movimientos/tx-1',
    );

    expect(res.status).toBe(500);
  });
});

describe('registrarMovimientos — GET /api/movimientos', () => {
  it('200 con el DTO y llama con userId + periodo', async () => {
    const uc = {
      execute: vi.fn().mockResolvedValue(Result.ok(MOVIMIENTOS_OK)),
    };
    const res = await request(probeApp(uc)).get(
      '/api/movimientos?periodo=2026-07',
    );

    expect(res.status).toBe(200);
    expect(res.body.periodo).toBe('2026-07');
    expect(res.body.totalTransacciones).toBe(0);
    expect(uc.execute).toHaveBeenCalledWith({
      userId: 'user-x',
      periodo: '2026-07',
    });
  });

  it('sin periodo → periodo undefined', async () => {
    const uc = {
      execute: vi.fn().mockResolvedValue(Result.ok(MOVIMIENTOS_OK)),
    };
    await request(probeApp(uc)).get('/api/movimientos');

    expect(uc.execute).toHaveBeenCalledWith({
      userId: 'user-x',
      periodo: undefined,
    });
  });

  it('400 scrubbeado si el periodo es inválido', async () => {
    const uc = {
      execute: vi
        .fn()
        .mockResolvedValue(
          Result.fail(new PeriodoInvalidoError('periodo-malo')),
        ),
    };
    const res = await request(probeApp(uc)).get(
      '/api/movimientos?periodo=periodo-malo',
    );

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain('periodo-malo');
  });

  it('500 ante error inesperado (rejection → error middleware)', async () => {
    const uc = { execute: vi.fn().mockRejectedValue(new Error('DB caída')) };
    const res = await request(probeApp(uc)).get('/api/movimientos');

    expect(res.status).toBe(500);
  });

  it('400 scrubbeado si periodo llega como shape de transporte inválido (array), sin llamar al use case', async () => {
    const uc = { execute: vi.fn() };
    const res = await request(probeApp(uc)).get(
      '/api/movimientos?periodo=2026-07&periodo=2026-08',
    );

    expect(res.status).toBe(400);
    expect(uc.execute).not.toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toContain('2026-08');
  });
});
