import express, { type Express } from 'express';
import request from 'supertest';
import {
  registrarCuentaFusionar,
  type CuentaFusionarDeps,
} from './cuenta-fusionar.routes';
import { errorMiddleware } from '../middleware/error.middleware';
import { Result } from '../../../shared/result';
import { FusionFallidaError } from '../../../domain/errors/fusion-fallida.error';

const RESUMEN = {
  cuentasMovidas: 1,
  cuentasUnidas: 2,
  movimientosMovidos: 30,
  duplicadosOmitidos: 4,
  categoriasMovidas: 3,
  patronesMovidos: 5,
};

function deps(over: Partial<CuentaFusionarDeps> = {}): CuentaFusionarDeps {
  return {
    fusionarCuenta: {
      execute: vi.fn().mockResolvedValue(Result.ok(RESUMEN)),
    },
    fusionarRateLimiter: {
      isBlocked: vi.fn().mockReturnValue(false),
      recordFailure: vi.fn(),
      reset: vi.fn(),
    },
    ...over,
  } as unknown as CuentaFusionarDeps;
}

function app(d: CuentaFusionarDeps): Express {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    req.userId = 'destino-1';
    next();
  });
  const router = express.Router();
  registrarCuentaFusionar(router, d);
  a.use('/api', router);
  a.use(errorMiddleware);
  return a;
}

function falla(motivo: 'origen-invalido' | 'destino-anonimo') {
  return {
    execute: vi
      .fn()
      .mockResolvedValue(Result.fail(new FusionFallidaError(motivo))),
  } as unknown as CuentaFusionarDeps['fusionarCuenta'];
}

describe('POST /api/cuenta/fusionar (ADR-014)', () => {
  it('fusiona el origen del token en el usuario de la sesión y responde los conteos', async () => {
    const d = deps();

    const res = await request(app(d))
      .post('/api/cuenta/fusionar')
      .send({ tokenOrigen: 'tok-origen', userId: 'otro-usuario' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(RESUMEN);
    expect(d.fusionarCuenta.execute).toHaveBeenCalledWith({
      destinoUserId: 'destino-1',
      tokenOrigen: 'tok-origen',
    });
    expect(d.fusionarRateLimiter.reset).toHaveBeenCalledTimes(1);
  });

  it('409 ORIGEN_INVALIDO, nunca 401, y no libera el presupuesto', async () => {
    const d = deps({ fusionarCuenta: falla('origen-invalido') });

    const res = await request(app(d))
      .post('/api/cuenta/fusionar')
      .send({ tokenOrigen: 'malo' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      message: 'Esos datos ya no están disponibles.',
      code: 'ORIGEN_INVALIDO',
    });
    expect(d.fusionarRateLimiter.reset).not.toHaveBeenCalled();
    expect(d.fusionarRateLimiter.recordFailure).toHaveBeenCalledTimes(1);
  });

  it('409 DESTINO_ANONIMO cuando quien llama es anónimo', async () => {
    const d = deps({ fusionarCuenta: falla('destino-anonimo') });

    const res = await request(app(d))
      .post('/api/cuenta/fusionar')
      .send({ tokenOrigen: 'tok' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DESTINO_ANONIMO');
  });

  it.each([
    ['sin cuerpo', undefined],
    ['sin tokenOrigen', {}],
    ['tokenOrigen vacío', { tokenOrigen: '' }],
    ['tokenOrigen que no es texto', { tokenOrigen: 42 }],
    ['tokenOrigen demasiado largo', { tokenOrigen: 'x'.repeat(513) }],
  ])('400 BODY_INVALIDO %s: no ejecuta nada', async (_n, body) => {
    const d = deps();

    const req = request(app(d)).post('/api/cuenta/fusionar');
    const res = await (body === undefined ? req : req.send(body));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BODY_INVALIDO');
    expect(d.fusionarCuenta.execute).not.toHaveBeenCalled();
  });

  it('429 sin tocar nada cuando la IP superó su presupuesto', async () => {
    const d = deps();
    vi.mocked(d.fusionarRateLimiter.isBlocked).mockReturnValue(true);

    const res = await request(app(d))
      .post('/api/cuenta/fusionar')
      .send({ tokenOrigen: 'tok' });

    expect(res.status).toBe(429);
    expect(d.fusionarCuenta.execute).not.toHaveBeenCalled();
  });

  it('cada intento cuenta contra el presupuesto antes de ejecutar', async () => {
    const d = deps();

    await request(app(d))
      .post('/api/cuenta/fusionar')
      .send({ tokenOrigen: 'tok' });

    expect(d.fusionarRateLimiter.recordFailure).toHaveBeenCalledTimes(1);
  });

  it('503 SERVICIO_NO_DISPONIBLE ante un fallo inesperado, sin filtrar el error', async () => {
    const d = deps({
      fusionarCuenta: {
        execute: vi.fn().mockRejectedValue(new Error('conexion: secreto')),
      } as unknown as CuentaFusionarDeps['fusionarCuenta'],
    });

    const res = await request(app(d))
      .post('/api/cuenta/fusionar')
      .send({ tokenOrigen: 'tok' });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SERVICIO_NO_DISPONIBLE');
    expect(JSON.stringify(res.body)).not.toContain('secreto');
    expect(d.fusionarRateLimiter.reset).not.toHaveBeenCalled();
  });
});
