import express, { type Express } from 'express';
import request from 'supertest';
import {
  registrarAuthGoogle,
  registrarAuthGoogleDeshabilitado,
  type AuthGoogleDeps,
} from './auth-google.routes';
import { errorMiddleware } from '../middleware/error.middleware';
import { Result } from '../../../shared/result';
import { LoginConGoogleFallidoError } from '../../../domain/errors/login-con-google-fallido.error';
import { VerificacionIdentidadFallidaError } from '../../../domain/errors/verificacion-identidad-fallida.error';
import { VinculacionGoogleFallidaError } from '../../../domain/errors/vinculacion-google-fallida.error';
import { serializeOauthCookie } from '../../http/auth/oauth-transient-cookie';
import { firmarLinkIntent } from '../../http/auth/link-intent';
import type { LoginUseCaseResult } from '../../../application/use-cases/login.use-case';
import { appLogger } from '../../logging/app-logger';

const REDIRECT_URI = 'https://app.moneydiary.cl/api/auth/google/callback';
const GENERIC_FAILURE_REDIRECT = '/login?error=google';
const OAUTH_STATE = { state: 's1', nonce: 'n1', codeVerifier: 'v1' };
const LINK_INTENT_KEY = Buffer.alloc(32, 6);

function deps(over: Partial<AuthGoogleDeps> = {}): AuthGoogleDeps {
  return {
    iniciador: {
      iniciar: vi.fn().mockResolvedValue(
        Result.ok({
          urlAutorizacion: 'https://accounts.google.com/o/oauth2/v2/auth?x=1',
          state: OAUTH_STATE.state,
          nonce: OAUTH_STATE.nonce,
          codeVerifier: OAUTH_STATE.codeVerifier,
        }),
      ),
    },
    verificador: {
      verificar: vi
        .fn()
        .mockResolvedValue(
          Result.ok({ sub: 'sub-1', email: 'a@b.cl', emailVerificado: true }),
        ),
    },
    loginConGoogle: {
      execute: vi.fn().mockResolvedValue(
        Result.ok<LoginUseCaseResult>({
          token: 'tok',
          userId: 'user-1',
          expiresAt: new Date('2026-08-15T00:00:00.000Z'),
        }),
      ),
    },
    vincularGoogle: {
      execute: vi.fn().mockResolvedValue(Result.ok(undefined)),
    },
    googleRateLimiter: {
      isBlocked: vi.fn().mockReturnValue(false),
      recordFailure: vi.fn(),
    },
    cookieSecure: false,
    redirectUri: REDIRECT_URI,
    linkIntentKey: LINK_INTENT_KEY,
    ...over,
  } as unknown as AuthGoogleDeps;
}

function googleApp(d: AuthGoogleDeps): Express {
  const app = express();
  const router = express.Router();
  registrarAuthGoogle(router, d);
  app.use('/api', router);
  app.use(errorMiddleware);
  return app;
}

function oauthCookieHeader(
  secure = false,
  overrides: Partial<typeof OAUTH_STATE> = {},
): string {
  return serializeOauthCookie({ ...OAUTH_STATE, ...overrides }, secure).split(
    ';',
  )[0];
}

/** Cookie md_oauth CON un link-intent válido (firmado sobre OAUTH_STATE.state) para userId. */
function oauthCookieHeaderConLinkValido(userId = 'user-x'): string {
  const link = firmarLinkIntent(LINK_INTENT_KEY, OAUTH_STATE.state, userId);
  return serializeOauthCookie({ ...OAUTH_STATE, link }, false).split(';')[0];
}

/**
 * Locks the "redirect + no session on failure" contract (design §6.1): every
 * failure branch of the callback clears `md_oauth` but must NEVER set
 * `md_session` — a future refactor that moves session issuance earlier
 * couldn't silently leak a session past this assertion (4R R3 WARNING).
 */
function expectNoSessionCookie(cookies: (string | undefined)[]): void {
  expect(cookies.some((c) => c?.startsWith('md_session='))).toBe(false);
}

describe('registrarAuthGoogle — GET /api/auth/google (initiate)', () => {
  it('403 si no es navegación top-level (Sec-Fetch guard, AUTH-11) — no llama a iniciador ni setea cookie', async () => {
    const d = deps();
    const res = await request(googleApp(d))
      .get('/api/auth/google')
      .set('Sec-Fetch-Dest', 'image');

    expect(res.status).toBe(403);
    expect(d.iniciador.iniciar).not.toHaveBeenCalled();
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('302 a Google + Set-Cookie md_oauth en una navegación top-level válida', async () => {
    const res = await request(googleApp(deps())).get('/api/auth/google');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth?x=1',
    );
    const cookies = [res.headers['set-cookie']].flat();
    expect(cookies.some((c) => c?.startsWith('md_oauth='))).toBe(true);
  });

  it('429 después de exceder el presupuesto del rate limiter compartido', async () => {
    const d = deps({
      googleRateLimiter: {
        isBlocked: vi.fn().mockReturnValue(true),
        recordFailure: vi.fn(),
      } as never,
    });
    const res = await request(googleApp(d)).get('/api/auth/google');

    expect(res.status).toBe(429);
    expect(d.iniciador.iniciar).not.toHaveBeenCalled();
  });

  it('fallo inesperado (throw) al iniciar produce el mismo redirect genérico, nunca un 500 crudo', async () => {
    const d = deps({
      iniciador: {
        iniciar: vi.fn().mockRejectedValue(new Error('boom')),
      },
    });
    const res = await request(googleApp(d)).get('/api/auth/google');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(GENERIC_FAILURE_REDIRECT);
  });

  it('Result.fail de iniciador() redirige genérico (nunca 500)', async () => {
    const d = deps({
      iniciador: {
        iniciar: vi
          .fn()
          .mockResolvedValue(
            Result.fail(new VerificacionIdentidadFallidaError('boom')),
          ),
      },
    });
    const res = await request(googleApp(d)).get('/api/auth/google');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(GENERIC_FAILURE_REDIRECT);
  });
});

describe('registrarAuthGoogle — GET /api/auth/google/callback', () => {
  it('state ausente/mal-emparejado → 302 genérico, el verificador NUNCA se invoca (AUTH-12)', async () => {
    const d = deps();
    const res = await request(googleApp(d))
      .get('/api/auth/google/callback')
      .query({ code: 'c', state: 'no-coincide' })
      .set('Cookie', oauthCookieHeader());

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(GENERIC_FAILURE_REDIRECT);
    expect(d.verificador.verificar).not.toHaveBeenCalled();
    expectNoSessionCookie([res.headers['set-cookie']].flat());
  });

  it('sin cookie md_oauth en absoluto → 302 genérico, verificador nunca invocado', async () => {
    const d = deps();
    const res = await request(googleApp(d))
      .get('/api/auth/google/callback')
      .query({ code: 'c', state: OAUTH_STATE.state });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(GENERIC_FAILURE_REDIRECT);
    expect(d.verificador.verificar).not.toHaveBeenCalled();
    expectNoSessionCookie([res.headers['set-cookie']].flat());
  });

  it('md_oauth se limpia incluso en la rama de state mismatch (Max-Age=0)', async () => {
    const res = await request(googleApp(deps()))
      .get('/api/auth/google/callback')
      .query({ code: 'c', state: 'no-coincide' })
      .set('Cookie', oauthCookieHeader());

    const cookies = [res.headers['set-cookie']].flat();
    expect(
      cookies.some(
        (c) => c?.startsWith('md_oauth=;') && c.includes('Max-Age=0'),
      ),
    ).toBe(true);
    expectNoSessionCookie(cookies);
  });

  it('callback happy path: Set-Cookie md_session (mismos atributos que password login) + 302 a / + md_oauth limpiada', async () => {
    const res = await request(googleApp(deps()))
      .get('/api/auth/google/callback')
      .query({ code: 'c', state: OAUTH_STATE.state })
      .set('Cookie', oauthCookieHeader());

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');

    const cookies = [res.headers['set-cookie']].flat();
    const sessionCookie = cookies.find((c) => c?.startsWith('md_session='));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toContain('HttpOnly');
    expect(sessionCookie).toContain('SameSite=Strict');
    expect(sessionCookie).not.toMatch(/Domain=/);

    const oauthClear = cookies.find((c) => c?.startsWith('md_oauth=;'));
    expect(oauthClear).toBeDefined();
    expect(oauthClear).toContain('Max-Age=0');
  });

  it('id_token tampered/expired (verificador Result.fail) → 302 genérico, md_oauth limpiada, verificador SÍ fue invocado', async () => {
    const d = deps({
      verificador: {
        verificar: vi
          .fn()
          .mockResolvedValue(
            Result.fail(
              new VerificacionIdentidadFallidaError('id-token-invalido'),
            ),
          ),
      },
    });
    const res = await request(googleApp(d))
      .get('/api/auth/google/callback')
      .query({ code: 'c', state: OAUTH_STATE.state })
      .set('Cookie', oauthCookieHeader());

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(GENERIC_FAILURE_REDIRECT);
    expect(d.verificador.verificar).toHaveBeenCalled();
    expectNoSessionCookie([res.headers['set-cookie']].flat());
  });

  it('sin match (LoginConGoogleUseCase Result.fail) → 302 genérico, byte-idéntico al resto de fallos (AUTH-15)', async () => {
    const d = deps({
      loginConGoogle: {
        execute: vi
          .fn()
          .mockResolvedValue(
            Result.fail(new LoginConGoogleFallidoError('sin-match')),
          ),
      } as never,
    });
    const res = await request(googleApp(d))
      .get('/api/auth/google/callback')
      .query({ code: 'c', state: OAUTH_STATE.state })
      .set('Cookie', oauthCookieHeader());

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(GENERIC_FAILURE_REDIRECT);
    expectNoSessionCookie([res.headers['set-cookie']].flat());
  });

  it.each([
    'sin-match',
    'email-no-verificado',
    'usuario-demo',
    'ya-vinculado-a-otra-identidad',
    'link-perdio-la-carrera',
    'email-invalido',
  ] as const)(
    'AUTH-15: motivo "%s" produce EXACTAMENTE el mismo Location que cualquier otro fallo',
    async (motivo) => {
      const d = deps({
        loginConGoogle: {
          execute: vi
            .fn()
            .mockResolvedValue(
              Result.fail(new LoginConGoogleFallidoError(motivo)),
            ),
        } as never,
      });
      const res = await request(googleApp(d))
        .get('/api/auth/google/callback')
        .query({ code: 'c', state: OAUTH_STATE.state })
        .set('Cookie', oauthCookieHeader());

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(GENERIC_FAILURE_REDIRECT);
      expectNoSessionCookie([res.headers['set-cookie']].flat());
    },
  );

  it('429 después de exceder el presupuesto COMPARTIDO del rate limiter (mismo prefijo que initiate, design §6.4)', async () => {
    const d = deps({
      googleRateLimiter: {
        isBlocked: vi.fn().mockReturnValue(true),
        recordFailure: vi.fn(),
      } as never,
    });
    const res = await request(googleApp(d))
      .get('/api/auth/google/callback')
      .query({ code: 'c', state: OAUTH_STATE.state })
      .set('Cookie', oauthCookieHeader());

    expect(res.status).toBe(429);
    expect(d.verificador.verificar).not.toHaveBeenCalled();
    expectNoSessionCookie([res.headers['set-cookie']].flat());
  });

  it('infra fault mid-flow (loginConGoogle rechaza inesperadamente) → 302 genérico, NUNCA un 500 (4R carry-forward, AUTH-15)', async () => {
    const d = deps({
      loginConGoogle: {
        execute: vi
          .fn()
          .mockRejectedValue(new Error('DB caída a mitad de flujo')),
      } as never,
    });
    const res = await request(googleApp(d))
      .get('/api/auth/google/callback')
      .query({ code: 'c', state: OAUTH_STATE.state })
      .set('Cookie', oauthCookieHeader());

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(GENERIC_FAILURE_REDIRECT);
    expectNoSessionCookie([res.headers['set-cookie']].flat());
  });

  it('infra fault mid-flow: md_oauth igual se limpia', async () => {
    const d = deps({
      loginConGoogle: {
        execute: vi.fn().mockRejectedValue(new Error('DB caída')),
      } as never,
    });
    const res = await request(googleApp(d))
      .get('/api/auth/google/callback')
      .query({ code: 'c', state: OAUTH_STATE.state })
      .set('Cookie', oauthCookieHeader());

    const cookies = [res.headers['set-cookie']].flat();
    expect(cookies.some((c) => c?.startsWith('md_oauth=;'))).toBe(true);
    expectNoSessionCookie(cookies);
  });

  it('infra fault en verificador.verificar (throw, no Result.fail) → 302 genérico', async () => {
    const d = deps({
      verificador: {
        verificar: vi.fn().mockRejectedValue(new Error('timeout de red')),
      },
    });
    const res = await request(googleApp(d))
      .get('/api/auth/google/callback')
      .query({ code: 'c', state: OAUTH_STATE.state })
      .set('Cookie', oauthCookieHeader());

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(GENERIC_FAILURE_REDIRECT);
    expectNoSessionCookie([res.headers['set-cookie']].flat());
  });

  it('403 si el callback no llega como navegación top-level (Sec-Fetch guard aplicado a AMBOS endpoints, design §3)', async () => {
    const res = await request(googleApp(deps()))
      .get('/api/auth/google/callback')
      .query({ code: 'c', state: OAUTH_STATE.state })
      .set('Cookie', oauthCookieHeader())
      .set('Sec-Fetch-Dest', 'iframe');

    expect(res.status).toBe(403);
    expectNoSessionCookie([res.headers['set-cookie']].flat());
  });

  it('construye urlCallback desde el redirectUri CONFIGURADO, no desde headers de la request (design §7 — nunca derivar de x-forwarded-host)', async () => {
    const d = deps();
    await request(googleApp(d))
      .get('/api/auth/google/callback')
      .query({ code: 'c', state: OAUTH_STATE.state })
      .set('Cookie', oauthCookieHeader())
      .set('Host', 'attacker.example.com')
      .set('X-Forwarded-Host', 'attacker.example.com');

    expect(d.verificador.verificar).toHaveBeenCalledWith(
      expect.objectContaining({
        urlCallback: expect.stringMatching(/^https:\/\/app\.moneydiary\.cl\//),
      }),
    );
  });
});

/**
 * Callback branching — modo LINK (US-041, design §4.2, §6.2 nuevos casos).
 * Cada caso de acá deja las escenas de login (arriba) SIN NINGÚN cambio de
 * assertion — solo agrega cobertura nueva (design §6.1 invariante).
 */
describe('registrarAuthGoogle — GET /api/auth/google/callback — modo LINK (US-041)', () => {
  it('sin link en la cookie ⇒ loginConGoogle se llama, vincularGoogle NO (VINC041-02, D-03)', async () => {
    const d = deps();
    const res = await request(googleApp(d))
      .get('/api/auth/google/callback')
      .query({ code: 'c', state: OAUTH_STATE.state })
      .set('Cookie', oauthCookieHeader());

    expect(res.status).toBe(302);
    expect(d.loginConGoogle.execute).toHaveBeenCalled();
    expect(d.vincularGoogle.execute).not.toHaveBeenCalled();
  });

  it('link VÁLIDO ⇒ vincularGoogle.execute({userId, sub}), loginConGoogle NO, SIN Set-Cookie md_session, redirect a /configuracion?google=vinculado', async () => {
    const d = deps();
    const res = await request(googleApp(d))
      .get('/api/auth/google/callback')
      .query({ code: 'c', state: OAUTH_STATE.state })
      .set('Cookie', oauthCookieHeaderConLinkValido('user-x'));

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/configuracion?google=vinculado');
    expect(d.vincularGoogle.execute).toHaveBeenCalledWith({
      userId: 'user-x',
      sub: 'sub-1',
    });
    expect(d.loginConGoogle.execute).not.toHaveBeenCalled();
    expectNoSessionCookie([res.headers['set-cookie']].flat());
  });

  it('link válido pero VincularGoogleUseCase falla ⇒ redirect a /configuracion?google=error, sin sesión', async () => {
    const d = deps({
      vincularGoogle: {
        execute: vi
          .fn()
          .mockResolvedValue(
            Result.fail(new VinculacionGoogleFallidaError('usuario-demo')),
          ),
      } as never,
    });
    const res = await request(googleApp(d))
      .get('/api/auth/google/callback')
      .query({ code: 'c', state: OAUTH_STATE.state })
      .set('Cookie', oauthCookieHeaderConLinkValido('user-x'));

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/configuracion?google=error');
    expectNoSessionCookie([res.headers['set-cookie']].flat());
  });

  it('★ BINDING PROOF (a) — link CON MAC TAMPERED (userId swapped) ⇒ /login?error=google, verificador.verificar NUNCA llamado, NINGÚN use case llamado', async () => {
    const d = deps();
    // Firma un intent válido para 'user-x', pero lo presenta reclamando 'user-victima'.
    const macDeOtroUsuario = firmarLinkIntent(
      LINK_INTENT_KEY,
      OAUTH_STATE.state,
      'user-x',
    ).mac;
    const cookie = serializeOauthCookie(
      {
        ...OAUTH_STATE,
        link: { userId: 'user-victima', mac: macDeOtroUsuario },
      },
      false,
    ).split(';')[0];

    const res = await request(googleApp(d))
      .get('/api/auth/google/callback')
      .query({ code: 'c', state: OAUTH_STATE.state })
      .set('Cookie', cookie);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(GENERIC_FAILURE_REDIRECT);
    expect(d.verificador.verificar).not.toHaveBeenCalled();
    expect(d.loginConGoogle.execute).not.toHaveBeenCalled();
    expect(d.vincularGoogle.execute).not.toHaveBeenCalled();
    expectNoSessionCookie([res.headers['set-cookie']].flat());
  });

  it('★ BINDING PROOF (a) — link con MAC de un state DISTINTO (cross-flow replay) ⇒ /login?error=google, verificador NUNCA llamado', async () => {
    const d = deps();
    const link = firmarLinkIntent(
      LINK_INTENT_KEY,
      'otro-state-de-otro-flujo',
      'user-x',
    );
    const cookie = serializeOauthCookie({ ...OAUTH_STATE, link }, false).split(
      ';',
    )[0];

    const res = await request(googleApp(d))
      .get('/api/auth/google/callback')
      .query({ code: 'c', state: OAUTH_STATE.state })
      .set('Cookie', cookie);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(GENERIC_FAILURE_REDIRECT);
    expect(d.verificador.verificar).not.toHaveBeenCalled();
    expect(d.vincularGoogle.execute).not.toHaveBeenCalled();
    expectNoSessionCookie([res.headers['set-cookie']].flat());
  });

  it('★ BINDING PROOF (a) — link con mac ausente/vacío ⇒ /login?error=google, verificador NUNCA llamado', async () => {
    const d = deps();
    const cookie = serializeOauthCookie(
      { ...OAUTH_STATE, link: { userId: 'user-x', mac: '' } },
      false,
    ).split(';')[0];

    const res = await request(googleApp(d))
      .get('/api/auth/google/callback')
      .query({ code: 'c', state: OAUTH_STATE.state })
      .set('Cookie', cookie);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(GENERIC_FAILURE_REDIRECT);
    expect(d.verificador.verificar).not.toHaveBeenCalled();
    expect(d.vincularGoogle.execute).not.toHaveBeenCalled();
  });

  it('REJECT-NEVER-FALLBACK: un link inválido NUNCA cae al login use case, ni siquiera si loginConGoogle habría tenido éxito', async () => {
    const d = deps();
    const cookie = serializeOauthCookie(
      {
        ...OAUTH_STATE,
        link: { userId: 'user-x', mac: 'invalido-no-base64url!!' },
      },
      false,
    ).split(';')[0];

    const res = await request(googleApp(d))
      .get('/api/auth/google/callback')
      .query({ code: 'c', state: OAUTH_STATE.state })
      .set('Cookie', cookie);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(GENERIC_FAILURE_REDIRECT);
    expect(d.loginConGoogle.execute).not.toHaveBeenCalled();
  });

  it('logging: el rechazo por link-intent inválido loguea SOLO {path} — nunca userId/mac/state', async () => {
    const warnSpy = vi.spyOn(appLogger, 'warn');
    const d = deps();
    const cookie = serializeOauthCookie(
      { ...OAUTH_STATE, link: { userId: 'user-x', mac: '' } },
      false,
    ).split(';')[0];

    await request(googleApp(d))
      .get('/api/auth/google/callback')
      .query({ code: 'c', state: OAUTH_STATE.state })
      .set('Cookie', cookie);

    const rejectionCall = warnSpy.mock.calls.find((call) =>
      String(call[0]).includes('link-intent inválido'),
    );
    expect(rejectionCall).toBeDefined();
    const context = rejectionCall![1];
    expect(context).toEqual({ path: '/auth/google/callback' });
  });

  it('md_oauth se limpia también en la rama de link inválido', async () => {
    const d = deps();
    const cookie = serializeOauthCookie(
      { ...OAUTH_STATE, link: { userId: 'user-x', mac: '' } },
      false,
    ).split(';')[0];

    const res = await request(googleApp(d))
      .get('/api/auth/google/callback')
      .query({ code: 'c', state: OAUTH_STATE.state })
      .set('Cookie', cookie);

    const cookies = [res.headers['set-cookie']].flat();
    expect(cookies.some((c) => c?.startsWith('md_oauth=;'))).toBe(true);
  });
});

describe('registrarAuthGoogle — debug logging redaction contract (ADR-013, mismos invariantes que login-con-google.use-case.spec.ts)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initiate: ningún context logueado en debug contiene @, token, Bearer, code= ni el state/nonce/codeVerifier crudos', async () => {
    const debugSpy = vi.spyOn(appLogger, 'debug');

    await request(googleApp(deps())).get('/api/auth/google');

    expect(debugSpy.mock.calls.length).toBeGreaterThan(0);
    // Solo los contexts (2do argumento) — igual que login-con-google.use-case.spec.ts,
    // el mensaje estático en sí puede mencionar palabras como "token" sin ser un leak.
    const serializedContexts = JSON.stringify(
      debugSpy.mock.calls.map((call) => call[1]),
    );
    expect(serializedContexts).not.toContain('@');
    expect(serializedContexts).not.toContain('token');
    expect(serializedContexts).not.toContain('Bearer');
    expect(serializedContexts).not.toContain('code=');
    expect(serializedContexts).not.toContain(OAUTH_STATE.state);
    expect(serializedContexts).not.toContain(OAUTH_STATE.nonce);
    expect(serializedContexts).not.toContain(OAUTH_STATE.codeVerifier);
  });

  it('callback happy path: ningún context logueado en debug contiene @, token, Bearer, code= ni los fixtures crudos de state/sub/email', async () => {
    const debugSpy = vi.spyOn(appLogger, 'debug');

    await request(googleApp(deps()))
      .get('/api/auth/google/callback')
      .query({ code: 'c', state: OAUTH_STATE.state })
      .set('Cookie', oauthCookieHeader());

    expect(debugSpy.mock.calls.length).toBeGreaterThan(0);
    // Solo los contexts (2do argumento) — igual que login-con-google.use-case.spec.ts,
    // el mensaje estático en sí puede mencionar palabras como "token" sin ser un leak.
    const serializedContexts = JSON.stringify(
      debugSpy.mock.calls.map((call) => call[1]),
    );
    expect(serializedContexts).not.toContain('@');
    expect(serializedContexts).not.toContain('token');
    expect(serializedContexts).not.toContain('Bearer');
    expect(serializedContexts).not.toContain('code=');
    expect(serializedContexts).not.toContain(OAUTH_STATE.state);
    expect(serializedContexts).not.toContain('sub-1');
    expect(serializedContexts).not.toContain('a@b.cl');
  });
});

describe('registrarAuthGoogleDeshabilitado — regresión (C1.5, no duplicar cobertura de app-level)', () => {
  it('sigue existiendo y sigue respondiendo 404 en ambos paths', async () => {
    const app = express();
    const router = express.Router();
    registrarAuthGoogleDeshabilitado(router);
    app.use('/api', router);

    const initiate = await request(app).get('/api/auth/google');
    const callback = await request(app).get('/api/auth/google/callback');

    expect(initiate.status).toBe(404);
    expect(callback.status).toBe(404);
  });
});
