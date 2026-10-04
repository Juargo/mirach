import express, { type Express } from 'express';
import request from 'supertest';
import { registrarCuenta } from './cuenta.routes';
import { Result } from '../../../shared/result';
import { errorMiddleware } from '../middleware/error.middleware';
import { ConfirmacionEliminacionInvalidaError } from '../../../domain/errors/confirmacion-eliminacion-invalida.error';
import type { EliminarCuentaUseCase } from '../../../application/use-cases/eliminar-cuenta.use-case';

function app(
  eliminarCuenta: Pick<EliminarCuentaUseCase, 'execute'>,
  cookieSecure = false,
): Express {
  const expressApp = express();
  expressApp.use(express.json());
  const router = express.Router();
  router.use((req, _res, next) => {
    req.userId = 'user-x';
    next();
  });
  registrarCuenta(router, {
    eliminarCuenta: eliminarCuenta as EliminarCuentaUseCase,
    cookieSecure,
  });
  expressApp.use('/api', router);
  expressApp.use(errorMiddleware);
  return expressApp;
}

describe('registrarCuenta — DELETE /api/cuenta', () => {
  it('204 sin cuerpo y limpia la cookie de sesión', async () => {
    const uc = { execute: vi.fn().mockResolvedValue(Result.ok(undefined)) };

    const res = await request(app(uc))
      .delete('/api/cuenta')
      .send({ confirmacion: 'ELIMINAR' });

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toContain('md_session=;');
    expect(cookie).toContain('Max-Age=0');
  });

  it('el userId sale de la sesión, nunca del body', async () => {
    const uc = { execute: vi.fn().mockResolvedValue(Result.ok(undefined)) };

    await request(app(uc))
      .delete('/api/cuenta')
      .send({ confirmacion: 'ELIMINAR' });

    expect(uc.execute).toHaveBeenCalledWith({
      userId: 'user-x',
      confirmacion: 'ELIMINAR',
    });
  });

  it('un userId ajeno en el body se rechaza (.strict()) y no llega al use case', async () => {
    const uc = { execute: vi.fn() };

    const res = await request(app(uc))
      .delete('/api/cuenta')
      .send({ confirmacion: 'ELIMINAR', userId: 'otro' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CONFIRMACION_INVALIDA');
    expect(uc.execute).not.toHaveBeenCalled();
  });

  it('confirmación de otro tipo → 400 CONFIRMACION_INVALIDA sin tocar el use case', async () => {
    const uc = { execute: vi.fn() };

    const res = await request(app(uc))
      .delete('/api/cuenta')
      .send({ confirmacion: 5 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CONFIRMACION_INVALIDA');
    expect(uc.execute).not.toHaveBeenCalled();
  });

  it.each([
    ['sin body', undefined],
    ['body vacío', {}],
  ])(
    '%s → el use case recibe confirmacion undefined y rechaza con 400',
    async (_nombre, body) => {
      const uc = {
        execute: vi
          .fn()
          .mockResolvedValue(
            Result.fail(new ConfirmacionEliminacionInvalidaError()),
          ),
      };

      const req = request(app(uc)).delete('/api/cuenta');
      const res = await (body === undefined ? req : req.send(body));

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('CONFIRMACION_INVALIDA');
      expect(uc.execute).toHaveBeenCalledWith({
        userId: 'user-x',
        confirmacion: undefined,
      });
    },
  );

  it('400 CONFIRMACION_INVALIDA cuando el use case rechaza la confirmación, y no limpia cookie', async () => {
    const uc = {
      execute: vi
        .fn()
        .mockResolvedValue(
          Result.fail(new ConfirmacionEliminacionInvalidaError()),
        ),
    };

    const res = await request(app(uc))
      .delete('/api/cuenta')
      .send({ confirmacion: 'eliminar' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CONFIRMACION_INVALIDA');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('propaga un fallo inesperado al errorMiddleware (500)', async () => {
    const uc = { execute: vi.fn().mockRejectedValue(new Error('db down')) };

    const res = await request(app(uc))
      .delete('/api/cuenta')
      .send({ confirmacion: 'ELIMINAR' });

    expect(res.status).toBe(500);
  });
});
