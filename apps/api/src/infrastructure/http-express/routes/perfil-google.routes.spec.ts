import express, { type Express } from 'express';
import request from 'supertest';
import {
  registrarPerfilGoogleVincular,
  registrarPerfilGoogleVincularDeshabilitado,
  registrarPerfilGoogleDesvincular,
  type PerfilGoogleDeps,
} from './perfil-google.routes';
import { errorMiddleware } from '../middleware/error.middleware';
import { Result } from '../../../shared/result';
import { PerfilRechazadoError } from '../../../domain/errors/perfil-rechazado.error';
import { PerfilDemoSoloLecturaError } from '../../../domain/errors/perfil-demo-solo-lectura.error';
import { GoogleYaVinculadoError } from '../../../domain/errors/google-ya-vinculado.error';
import { VinculacionGoogleNoDisponibleError } from '../../../domain/errors/vinculacion-google-no-disponible.error';
import { VinculoRequierePasswordError } from '../../../domain/errors/vinculo-requiere-password.error';
import { verificarLinkIntent } from '../../http/auth/link-intent';
import { parseOauthCookie } from '../../http/auth/oauth-transient-cookie';
import type { IniciarVinculacionGoogleUseCase } from '../../../application/use-cases/iniciar-vinculacion-google.use-case';
import type { DesvincularGoogleUseCase } from '../../../application/use-cases/desvincular-google.use-case';

const LINK_INTENT_KEY = Buffer.alloc(32, 4);

const INICIO_OK = {
  urlAutorizacion: 'https://accounts.google.com/o/oauth2/v2/auth?x=1',
  state: 's1',
  nonce: 'n1',
  codeVerifier: 'v1',
};

function deps(over: Partial<PerfilGoogleDeps> = {}): PerfilGoogleDeps {
  return {
    iniciarVinculacion: {
      execute: vi.fn().mockResolvedValue(Result.ok(INICIO_OK)),
    } as unknown as IniciarVinculacionGoogleUseCase,
    linkIntentKey: LINK_INTENT_KEY,
    cookieSecure: false,
    ...over,
  };
}

function app(d: PerfilGoogleDeps): Express {
  const expressApp = express();
  expressApp.use(express.json());
  const router = express.Router();
  router.use((req, _res, next) => {
    req.userId = 'user-x';
    req.esDemo = false;
    next();
  });
  registrarPerfilGoogleVincular(router, d);
  expressApp.use('/api', router);
  expressApp.use(errorMiddleware);
  return expressApp;
}

function appDeshabilitado(): Express {
  const expressApp = express();
  const router = express.Router();
  registrarPerfilGoogleVincularDeshabilitado(router);
  expressApp.use('/api', router);
  return expressApp;
}

function makeDesvincularGoogle(
  execute = vi.fn().mockResolvedValue(Result.ok(undefined)),
): DesvincularGoogleUseCase {
  return { execute } as unknown as DesvincularGoogleUseCase;
}

function appDesvincular(desvincularGoogle: DesvincularGoogleUseCase): Express {
  const expressApp = express();
  expressApp.use(express.json());
  const router = express.Router();
  router.use((req, _res, next) => {
    req.userId = 'user-x';
    req.esDemo = false;
    next();
  });
  registrarPerfilGoogleDesvincular(router, desvincularGoogle);
  expressApp.use('/api', router);
  expressApp.use(errorMiddleware);
  return expressApp;
}

describe('registrarPerfilGoogleVincular — POST /api/perfil/google/vincular', () => {
  it('200 { urlAutorizacion } + Set-Cookie con un link firmado y verificable contra la misma key', async () => {
    const d = deps();
    const res = await request(app(d))
      .post('/api/perfil/google/vincular')
      .send({ passwordActual: 'correcta' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ urlAutorizacion: INICIO_OK.urlAutorizacion });

    const cookies = [res.headers['set-cookie']].flat();
    const oauthCookie = cookies.find((c) => c?.startsWith('md_oauth='));
    expect(oauthCookie).toBeDefined();

    const parsed = parseOauthCookie(oauthCookie!.split(';')[0]);
    expect(parsed).toBeDefined();
    expect(parsed!.link).toBeDefined();
    expect(parsed!.link!.userId).toBe('user-x');
    expect(
      verificarLinkIntent(LINK_INTENT_KEY, INICIO_OK.state, parsed!.link!),
    ).toBe(true);
  });

  it('esDemo/userId se hilvanan SIEMPRE desde req, nunca desde el body', async () => {
    const d = deps();
    await request(app(d))
      .post('/api/perfil/google/vincular')
      .send({ passwordActual: 'correcta' });

    expect(d.iniciarVinculacion.execute).toHaveBeenCalledWith({
      userId: 'user-x',
      esDemo: false,
      passwordActual: 'correcta',
    });
  });

  it('400 BODY_INVALIDO para body vacío ({})', async () => {
    const d = deps();
    const res = await request(app(d))
      .post('/api/perfil/google/vincular')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BODY_INVALIDO');
    expect(d.iniciarVinculacion.execute).not.toHaveBeenCalled();
  });

  it('400 BODY_INVALIDO para { passwordActual, userId: "otro" } — .strict() rechaza el campo extra', async () => {
    const d = deps();
    const res = await request(app(d))
      .post('/api/perfil/google/vincular')
      .send({ passwordActual: 'x', userId: 'otro' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BODY_INVALIDO');
    expect(d.iniciarVinculacion.execute).not.toHaveBeenCalled();
  });

  it('403 DEMO_SOLO_LECTURA cuando el use case rechaza por demo', async () => {
    const d = deps({
      iniciarVinculacion: {
        execute: vi
          .fn()
          .mockResolvedValue(Result.fail(new PerfilDemoSoloLecturaError())),
      } as unknown as IniciarVinculacionGoogleUseCase,
    });
    const res = await request(app(d))
      .post('/api/perfil/google/vincular')
      .send({ passwordActual: 'x' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DEMO_SOLO_LECTURA');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('403 PERFIL_RECHAZADO cuando el use case rechaza por password incorrecta', async () => {
    const d = deps({
      iniciarVinculacion: {
        execute: vi
          .fn()
          .mockResolvedValue(Result.fail(new PerfilRechazadoError())),
      } as unknown as IniciarVinculacionGoogleUseCase,
    });
    const res = await request(app(d))
      .post('/api/perfil/google/vincular')
      .send({ passwordActual: 'incorrecta' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERFIL_RECHAZADO');
  });

  it('409 GOOGLE_YA_VINCULADO cuando el use case rechaza porque ya hay un vínculo', async () => {
    const d = deps({
      iniciarVinculacion: {
        execute: vi
          .fn()
          .mockResolvedValue(Result.fail(new GoogleYaVinculadoError())),
      } as unknown as IniciarVinculacionGoogleUseCase,
    });
    const res = await request(app(d))
      .post('/api/perfil/google/vincular')
      .send({ passwordActual: 'x' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('GOOGLE_YA_VINCULADO');
  });

  it('503 GOOGLE_NO_DISPONIBLE cuando iniciador.iniciar() falla dentro del use case', async () => {
    const d = deps({
      iniciarVinculacion: {
        execute: vi
          .fn()
          .mockResolvedValue(
            Result.fail(new VinculacionGoogleNoDisponibleError()),
          ),
      } as unknown as IniciarVinculacionGoogleUseCase,
    });
    const res = await request(app(d))
      .post('/api/perfil/google/vincular')
      .send({ passwordActual: 'x' });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('GOOGLE_NO_DISPONIBLE');
  });
});

describe('registrarPerfilGoogleVincularDeshabilitado — AUTH-16 parity', () => {
  it('404 sin body cuando Google está apagado', async () => {
    const res = await request(appDeshabilitado())
      .post('/api/perfil/google/vincular')
      .send({ passwordActual: 'x' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({});
  });
});

describe('registrarPerfilGoogleDesvincular — POST /api/perfil/google/desvincular (VINC041-05, task 3.7)', () => {
  it('204 sin body en éxito', async () => {
    const useCase = makeDesvincularGoogle();
    const res = await request(appDesvincular(useCase))
      .post('/api/perfil/google/desvincular')
      .send({ passwordActual: 'correcta' });

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  it('esDemo/userId se hilvanan SIEMPRE desde req, nunca desde el body', async () => {
    const execute = vi.fn().mockResolvedValue(Result.ok(undefined));
    const useCase = makeDesvincularGoogle(execute);
    await request(appDesvincular(useCase))
      .post('/api/perfil/google/desvincular')
      .send({ passwordActual: 'correcta' });

    expect(execute).toHaveBeenCalledWith({
      userId: 'user-x',
      esDemo: false,
      passwordActual: 'correcta',
    });
  });

  it('400 BODY_INVALIDO para body vacío ({})', async () => {
    const execute = vi.fn();
    const useCase = makeDesvincularGoogle(execute);
    const res = await request(appDesvincular(useCase))
      .post('/api/perfil/google/desvincular')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BODY_INVALIDO');
    expect(execute).not.toHaveBeenCalled();
  });

  it('400 BODY_INVALIDO para { passwordActual, userId: "otro" } — .strict() rechaza el campo extra', async () => {
    const execute = vi.fn();
    const useCase = makeDesvincularGoogle(execute);
    const res = await request(appDesvincular(useCase))
      .post('/api/perfil/google/desvincular')
      .send({ passwordActual: 'x', userId: 'otro' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BODY_INVALIDO');
    expect(execute).not.toHaveBeenCalled();
  });

  it('403 DEMO_SOLO_LECTURA cuando el use case rechaza por demo', async () => {
    const useCase = makeDesvincularGoogle(
      vi.fn().mockResolvedValue(Result.fail(new PerfilDemoSoloLecturaError())),
    );
    const res = await request(appDesvincular(useCase))
      .post('/api/perfil/google/desvincular')
      .send({ passwordActual: 'x' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DEMO_SOLO_LECTURA');
  });

  it('403 VINCULO_REQUIERE_PASSWORD cuando el use case rechaza por falta de passwordHash (binding proof (b))', async () => {
    const useCase = makeDesvincularGoogle(
      vi
        .fn()
        .mockResolvedValue(Result.fail(new VinculoRequierePasswordError())),
    );
    const res = await request(appDesvincular(useCase))
      .post('/api/perfil/google/desvincular')
      .send({ passwordActual: 'x' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('VINCULO_REQUIERE_PASSWORD');
  });

  it('403 PERFIL_RECHAZADO cuando el use case rechaza por password incorrecta', async () => {
    const useCase = makeDesvincularGoogle(
      vi.fn().mockResolvedValue(Result.fail(new PerfilRechazadoError())),
    );
    const res = await request(appDesvincular(useCase))
      .post('/api/perfil/google/desvincular')
      .send({ passwordActual: 'incorrecta' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERFIL_RECHAZADO');
  });
});
