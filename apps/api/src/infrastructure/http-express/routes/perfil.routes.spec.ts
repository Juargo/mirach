import express, { type Express } from 'express';
import request from 'supertest';
import { registrarPerfil } from './perfil.routes';
import { Result } from '../../../shared/result';
import { errorMiddleware } from '../middleware/error.middleware';
import { PerfilRechazadoError } from '../../../domain/errors/perfil-rechazado.error';
import { PerfilDemoSoloLecturaError } from '../../../domain/errors/perfil-demo-solo-lectura.error';
import { NombrePerfilInvalidoError } from '../../../domain/errors/nombre-perfil-invalido.error';
import { EmailInvalidoError } from '../../../domain/errors/email-invalido.error';
import { PasswordInvalidaError } from '../../../domain/errors/password-invalida.error';
import { appLogger } from '../../logging/app-logger';
import type { ActualizarPerfilUseCase } from '../../../application/use-cases/actualizar-perfil.use-case';
import type { CambiarPasswordUseCase } from '../../../application/use-cases/cambiar-password.use-case';

const IDENTIDAD = {
  userId: 'user-x',
  nombre: 'Jorge',
  email: 'jorge@example.com',
  esDemo: false,
  googleVinculado: false,
};

function app(
  actualizarPerfil: Pick<ActualizarPerfilUseCase, 'execute'>,
  cambiarPassword: Pick<CambiarPasswordUseCase, 'execute'> = {
    execute: vi.fn(),
  },
  /** issue #507: `true` deja `req.esDemo` SIN asignar — simula una request
   * que llegó al handler sin pasar por `sessionMiddleware` (refactor futuro,
   * sesión malformada). */
  esDemoUnset = false,
): Express {
  const expressApp = express();
  expressApp.use(express.json());
  const router = express.Router();
  router.use((req, _res, next) => {
    req.userId = 'user-x';
    if (!esDemoUnset) {
      req.esDemo = false;
    }
    req.sessionTokenHash = 'hash-de-la-sesion-actual';
    next();
  });
  registrarPerfil(router, {
    actualizarPerfil: actualizarPerfil as ActualizarPerfilUseCase,
    cambiarPassword: cambiarPassword as CambiarPasswordUseCase,
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

  it('200 con googleVinculado: true cuando la identidad devuelta ya tiene Google vinculado (VINC041-08)', async () => {
    const uc = {
      execute: vi
        .fn()
        .mockResolvedValue(Result.ok({ ...IDENTIDAD, googleVinculado: true })),
    };
    const res = await request(app(uc))
      .patch('/api/perfil')
      .send({ nombre: 'Jorge' });

    expect(res.status).toBe(200);
    expect(res.body.googleVinculado).toBe(true);
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
    [new NombrePerfilInvalidoError(), 400, 'NOMBRE_INVALIDO'],
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

  it('issue #507: req.esDemo undefined ⇒ fail-closed (esDemoDeSesion) — el use case recibe esDemo: true, nunca undefined', async () => {
    const uc = {
      execute: vi
        .fn()
        .mockResolvedValue(Result.fail(new PerfilDemoSoloLecturaError())),
    };
    const res = await request(app(uc, undefined, true))
      .patch('/api/perfil')
      .send({ nombre: 'Jorge' });

    expect(uc.execute).toHaveBeenCalledWith(
      expect.objectContaining({ esDemo: true }),
    );
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DEMO_SOLO_LECTURA');
  });

  it('issue #507 (ADR-033): un 403 DEMO_SOLO_LECTURA loguea el gate trip con { path }, nunca el body', async () => {
    const warnSpy = vi.spyOn(appLogger, 'warn').mockImplementation(() => {});
    const uc = {
      execute: vi
        .fn()
        .mockResolvedValue(Result.fail(new PerfilDemoSoloLecturaError())),
    };
    await request(app(uc)).patch('/api/perfil').send({ nombre: 'Jorge' });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('DEMO'), {
      path: '/perfil',
    });
    warnSpy.mockRestore();
  });
});

describe('registrarPerfil — PATCH /api/perfil/password', () => {
  const BODY = {
    passwordActual: 'actual-valida',
    passwordNueva: 'nueva-valida',
  };

  it('204 sin body cuando el use case retorna ok', async () => {
    const actualizarPerfil = { execute: vi.fn() };
    const cambiarPassword = {
      execute: vi.fn().mockResolvedValue(Result.ok(undefined)),
    };
    const res = await request(app(actualizarPerfil, cambiarPassword))
      .patch('/api/perfil/password')
      .send(BODY);

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  it('esDemo Y tokenHashActual se hilvanan desde req (nunca desde el body)', async () => {
    const actualizarPerfil = { execute: vi.fn() };
    const cambiarPassword = {
      execute: vi.fn().mockResolvedValue(Result.ok(undefined)),
    };
    await request(app(actualizarPerfil, cambiarPassword))
      .patch('/api/perfil/password')
      .send(BODY);

    expect(cambiarPassword.execute).toHaveBeenCalledWith({
      userId: 'user-x',
      esDemo: false,
      tokenHashActual: 'hash-de-la-sesion-actual',
      passwordActual: BODY.passwordActual,
      passwordNueva: BODY.passwordNueva,
    });
  });

  it('400 BODY_INVALIDO cuando falta passwordActual o passwordNueva', async () => {
    const actualizarPerfil = { execute: vi.fn() };
    const cambiarPassword = { execute: vi.fn() };
    const res = await request(app(actualizarPerfil, cambiarPassword))
      .patch('/api/perfil/password')
      .send({ passwordNueva: 'nueva-valida' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BODY_INVALIDO');
    expect(cambiarPassword.execute).not.toHaveBeenCalled();
  });

  it.each([
    [new PerfilDemoSoloLecturaError(), 403, 'DEMO_SOLO_LECTURA'],
    [new PerfilRechazadoError(), 403, 'PERFIL_RECHAZADO'],
    [new PasswordInvalidaError(), 400, 'PASSWORD_INVALIDA'],
  ] as const)('mapea %p a status %i / code %s', async (error, status, code) => {
    const actualizarPerfil = { execute: vi.fn() };
    const cambiarPassword = {
      execute: vi.fn().mockResolvedValue(Result.fail(error)),
    };
    const res = await request(app(actualizarPerfil, cambiarPassword))
      .patch('/api/perfil/password')
      .send(BODY);

    expect(res.status).toBe(status);
    expect(res.body.code).toBe(code);
  });

  it('issue #507: req.esDemo undefined ⇒ fail-closed — el use case recibe esDemo: true, nunca undefined', async () => {
    const actualizarPerfil = { execute: vi.fn() };
    const cambiarPassword = {
      execute: vi
        .fn()
        .mockResolvedValue(Result.fail(new PerfilDemoSoloLecturaError())),
    };
    const res = await request(app(actualizarPerfil, cambiarPassword, true))
      .patch('/api/perfil/password')
      .send(BODY);

    expect(cambiarPassword.execute).toHaveBeenCalledWith(
      expect.objectContaining({ esDemo: true }),
    );
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DEMO_SOLO_LECTURA');
  });

  it('issue #507 (ADR-033): un 403 DEMO_SOLO_LECTURA loguea el gate trip con { path }', async () => {
    const warnSpy = vi.spyOn(appLogger, 'warn').mockImplementation(() => {});
    const actualizarPerfil = { execute: vi.fn() };
    const cambiarPassword = {
      execute: vi
        .fn()
        .mockResolvedValue(Result.fail(new PerfilDemoSoloLecturaError())),
    };
    await request(app(actualizarPerfil, cambiarPassword))
      .patch('/api/perfil/password')
      .send(BODY);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('DEMO'), {
      path: '/perfil/password',
    });
    warnSpy.mockRestore();
  });
});
