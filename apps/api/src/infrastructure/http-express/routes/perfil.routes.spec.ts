import express, { type Express } from 'express';
import request from 'supertest';
import { registrarPerfil } from './perfil.routes';
import { Result } from '../../../shared/result';
import { errorMiddleware } from '../middleware/error.middleware';
import { PerfilRechazadoError } from '../../../domain/errors/perfil-rechazado.error';
import { PerfilDemoSoloLecturaError } from '../../../domain/errors/perfil-demo-solo-lectura.error';
import { NombrePerfilInvalidoError } from '../../../domain/errors/nombre-perfil-invalido.error';
import { EmailInvalidoError } from '../../../domain/errors/email-invalido.error';
import type { ActualizarPerfilUseCase } from '../../../application/use-cases/actualizar-perfil.use-case';

const IDENTIDAD = {
  userId: 'user-x',
  nombre: 'Jorge',
  email: 'jorge@example.com',
  esDemo: false,
};

function app(
  actualizarPerfil: Pick<ActualizarPerfilUseCase, 'execute'>,
): Express {
  const expressApp = express();
  expressApp.use(express.json());
  const router = express.Router();
  router.use((req, _res, next) => {
    req.userId = 'user-x';
    req.esDemo = false;
    next();
  });
  registrarPerfil(router, {
    actualizarPerfil: actualizarPerfil as ActualizarPerfilUseCase,
  });
  expressApp.use('/api', router);
  expressApp.use(errorMiddleware);
  return expressApp;
}

describe('registrarPerfil — PATCH /api/perfil', () => {
  it('200 con AuthMeResponse cuando el use case retorna ok', async () => {
    const uc = { execute: vi.fn().mockResolvedValue(Result.ok(IDENTIDAD)) };
    const res = await request(app(uc))
      .patch('/api/perfil')
      .send({ nombre: 'Jorge' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(IDENTIDAD);
  });

  it('400 BODY_INVALIDO para body vacío ({})', async () => {
    const uc = { execute: vi.fn() };
    const res = await request(app(uc)).patch('/api/perfil').send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BODY_INVALIDO');
    expect(uc.execute).not.toHaveBeenCalled();
  });

  it('400 BODY_INVALIDO para { email } sin passwordActual', async () => {
    const uc = { execute: vi.fn() };
    const res = await request(app(uc))
      .patch('/api/perfil')
      .send({ email: 'a@b.cl' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BODY_INVALIDO');
    expect(uc.execute).not.toHaveBeenCalled();
  });

  it('400 BODY_INVALIDO para { nombre, userId: "otro" } — .strict() (PERF040-07)', async () => {
    const uc = { execute: vi.fn() };
    const res = await request(app(uc))
      .patch('/api/perfil')
      .send({ nombre: 'Jorge', userId: 'otro' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BODY_INVALIDO');
    expect(uc.execute).not.toHaveBeenCalled();
  });

  it('esDemo y userId se hilvanan desde req (nunca desde el body)', async () => {
    const uc = { execute: vi.fn().mockResolvedValue(Result.ok(IDENTIDAD)) };
    await request(app(uc)).patch('/api/perfil').send({ nombre: 'Jorge' });

    expect(uc.execute).toHaveBeenCalledWith({
      userId: 'user-x',
      esDemo: false,
      nombre: 'Jorge',
      emailRaw: undefined,
      passwordActual: undefined,
    });
  });

  it.each([
    [new NombrePerfilInvalidoError('x'), 400, 'NOMBRE_INVALIDO'],
    [new EmailInvalidoError('x'), 400, 'EMAIL_INVALIDO'],
    [new PerfilDemoSoloLecturaError(), 403, 'DEMO_SOLO_LECTURA'],
    [new PerfilRechazadoError(), 403, 'PERFIL_RECHAZADO'],
  ] as const)('mapea %p a status %i / code %s', async (error, status, code) => {
    const uc = { execute: vi.fn().mockResolvedValue(Result.fail(error)) };
    const res = await request(app(uc))
      .patch('/api/perfil')
      .send({ nombre: 'Jorge' });

    expect(res.status).toBe(status);
    expect(res.body.code).toBe(code);
  });

  it('nunca ecoa el body ni los issues de Zod en un 400', async () => {
    const uc = { execute: vi.fn() };
    const res = await request(app(uc))
      .patch('/api/perfil')
      .send({ nombre: 'Jorge', userId: 'sneaky-value-12345' });

    expect(JSON.stringify(res.body)).not.toContain('sneaky-value-12345');
  });
});
