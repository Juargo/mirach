import { LoginConGoogleUseCase } from './login-con-google.use-case';
import {
  IIdentidadGoogleRepository,
  UsuarioVinculable,
} from '../ports/identidad-google-repository.port';
import { ISessionRepository } from '../ports/session-repository.port';
import {
  ISessionTokenService,
  TokenGenerado,
} from '../ports/session-token.port';
import { IReloj } from '../ports/reloj.port';
import { IdentidadExterna } from '../ports/verificador-identidad-externa.port';
import { LoginConGoogleFallidoError } from '../../domain/errors/login-con-google-fallido.error';
import { ILogger } from '../ports/logger.port';
import { makeMockIdentidadGoogleRepository as makeMockIdentidades } from '../../../test/support/identidad-google-repository.double';
import { NoOpLogger, FakeLogger } from '../../../test/support/logger.double';

// ──────────────────────────────────────────────────────────────────────────────
// Unit tests — LoginConGoogleUseCase (mocked ports, fake clock). No infra, no DB.
// ──────────────────────────────────────────────────────────────────────────────

function makeMockSessions(): ISessionRepository {
  return {
    crear: vi.fn().mockResolvedValue(undefined),
    buscarPorTokenHash: vi.fn(),
    revocarPorTokenHash: vi.fn(),
  };
}

function makeMockTokens(generado: TokenGenerado): ISessionTokenService {
  return {
    generar: vi.fn().mockReturnValue(generado),
    hashToken: vi.fn(),
  };
}

function makeFakeReloj(ahora: Date): IReloj {
  return { ahora: () => ahora };
}

const AHORA = new Date('2026-08-08T00:00:00.000Z');
const TOKEN_GENERADO: TokenGenerado = {
  token: 'raw-token-google',
  tokenHash: 'hashed-token-google',
};

const IDENTIDAD_BASE: IdentidadExterna = {
  sub: 'google-sub-abc',
  email: 'jorge@example.com',
  emailVerificado: true,
};

function makeUseCase(
  identidades: IIdentidadGoogleRepository,
  logger: ILogger = new NoOpLogger(),
) {
  const sessions = makeMockSessions();
  const tokens = makeMockTokens(TOKEN_GENERADO);
  const reloj = makeFakeReloj(AHORA);
  const uc = new LoginConGoogleUseCase(
    identidades,
    sessions,
    tokens,
    reloj,
    logger,
  );
  return { uc, sessions, tokens, reloj, logger };
}

describe('LoginConGoogleUseCase', () => {
  describe('existing googleSub match, non-demo', () => {
    it('issues a session and never looks up by email', async () => {
      const usuario: UsuarioVinculable = {
        userId: 'user-1',
        esDemo: false,
        googleSub: 'google-sub-abc',
      };
      const identidades = makeMockIdentidades({ porGoogleSub: usuario });
      const { uc, sessions } = makeUseCase(identidades);

      const result = await uc.execute(IDENTIDAD_BASE);

      expect(result.isOk()).toBe(true);
      const value = result.getValue();
      expect(value.token).toBe('raw-token-google');
      expect(value.userId).toBe('user-1');
      expect(value.expiresAt.toISOString()).toBe('2026-08-15T00:00:00.000Z');
      expect(sessions.crear).toHaveBeenCalledWith({
        userId: 'user-1',
        tokenHash: 'hashed-token-google',
        expiresAt: value.expiresAt,
      });
      expect(identidades.buscarPorEmail).not.toHaveBeenCalled();
      expect(identidades.vincularGoogleSub).not.toHaveBeenCalled();
    });
  });

  describe('existing googleSub match, demo user', () => {
    it('fails with the generic error, no session', async () => {
      const usuarioDemo: UsuarioVinculable = {
        userId: 'user-demo',
        esDemo: true,
        googleSub: 'google-sub-abc',
      };
      const identidades = makeMockIdentidades({ porGoogleSub: usuarioDemo });
      const { uc, sessions } = makeUseCase(identidades);

      const result = await uc.execute(IDENTIDAD_BASE);

      expect(result.isFail()).toBe(true);
      const error = result.getError();
      expect(error).toBeInstanceOf(LoginConGoogleFallidoError);
      expect(error.motivo).toBe('usuario-demo');
      expect(sessions.crear).not.toHaveBeenCalled();
    });
  });

  describe('first-time link, emailVerificado true, unmatched user found', () => {
    it('links googleSub and issues a session', async () => {
      const usuario: UsuarioVinculable = {
        userId: 'user-2',
        esDemo: false,
        googleSub: null,
      };
      const identidades = makeMockIdentidades({
        porGoogleSub: null,
        porEmail: usuario,
        vincular: true,
      });
      const { uc, sessions } = makeUseCase(identidades);

      const result = await uc.execute(IDENTIDAD_BASE);

      expect(result.isOk()).toBe(true);
      expect(identidades.vincularGoogleSub).toHaveBeenCalledWith(
        'user-2',
        'google-sub-abc',
      );
      expect(sessions.crear).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-2' }),
      );
    });
  });

  describe('emailVerificado false', () => {
    it('fails with the generic error and never looks up by email', async () => {
      const identidades = makeMockIdentidades({ porGoogleSub: null });
      const { uc, sessions } = makeUseCase(identidades);

      const result = await uc.execute({
        ...IDENTIDAD_BASE,
        emailVerificado: false,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError().motivo).toBe('email-no-verificado');
      expect(identidades.buscarPorEmail).not.toHaveBeenCalled();
      expect(identidades.vincularGoogleSub).not.toHaveBeenCalled();
      expect(sessions.crear).not.toHaveBeenCalled();
    });
  });

  describe('no match anywhere', () => {
    it('fails with the generic error and creates nothing', async () => {
      const identidades = makeMockIdentidades({
        porGoogleSub: null,
        porEmail: null,
      });
      const { uc, sessions } = makeUseCase(identidades);

      const result = await uc.execute(IDENTIDAD_BASE);

      expect(result.isFail()).toBe(true);
      expect(result.getError().motivo).toBe('sin-match');
      expect(identidades.vincularGoogleSub).not.toHaveBeenCalled();
      expect(sessions.crear).not.toHaveBeenCalled();
    });
  });

  describe('demo match via email path', () => {
    it('fails with the generic error, no link', async () => {
      const usuarioDemo: UsuarioVinculable = {
        userId: 'user-demo',
        esDemo: true,
        googleSub: null,
      };
      const identidades = makeMockIdentidades({
        porGoogleSub: null,
        porEmail: usuarioDemo,
      });
      const { uc, sessions } = makeUseCase(identidades);

      const result = await uc.execute(IDENTIDAD_BASE);

      expect(result.isFail()).toBe(true);
      expect(result.getError().motivo).toBe('usuario-demo');
      expect(identidades.vincularGoogleSub).not.toHaveBeenCalled();
      expect(sessions.crear).not.toHaveBeenCalled();
    });
  });

  describe('★ email match already linked to a different googleSub', () => {
    it('fails with the generic error, no overwrite, vincularGoogleSub never called', async () => {
      const usuarioYaLinkeado: UsuarioVinculable = {
        userId: 'user-3',
        esDemo: false,
        googleSub: 'otro-sub-distinto',
      };
      const identidades = makeMockIdentidades({
        porGoogleSub: null,
        porEmail: usuarioYaLinkeado,
      });
      const { uc, sessions } = makeUseCase(identidades);

      const result = await uc.execute(IDENTIDAD_BASE);

      expect(result.isFail()).toBe(true);
      expect(result.getError().motivo).toBe('ya-vinculado-a-otra-identidad');
      expect(identidades.vincularGoogleSub).not.toHaveBeenCalled();
      expect(sessions.crear).not.toHaveBeenCalled();
    });
  });

  describe('vincularGoogleSub returns false (race lost)', () => {
    it('fails with the generic error', async () => {
      const usuario: UsuarioVinculable = {
        userId: 'user-4',
        esDemo: false,
        googleSub: null,
      };
      const identidades = makeMockIdentidades({
        porGoogleSub: null,
        porEmail: usuario,
        vincular: false,
      });
      const { uc, sessions } = makeUseCase(identidades);

      const result = await uc.execute(IDENTIDAD_BASE);

      expect(result.isFail()).toBe(true);
      expect(result.getError().motivo).toBe('link-perdio-la-carrera');
      expect(sessions.crear).not.toHaveBeenCalled();
    });
  });

  describe('email inválido (identidad.email malformado o null)', () => {
    it('fails with the generic error and never looks up by email', async () => {
      const identidades = makeMockIdentidades({ porGoogleSub: null });
      const { uc } = makeUseCase(identidades);

      const result = await uc.execute({
        ...IDENTIDAD_BASE,
        email: null,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError().motivo).toBe('email-invalido');
      expect(identidades.buscarPorEmail).not.toHaveBeenCalled();
    });

    it('fails with the generic error for a non-null malformed email and never looks up by email or links', async () => {
      const identidades = makeMockIdentidades({ porGoogleSub: null });
      const { uc, sessions } = makeUseCase(identidades);

      const result = await uc.execute({
        ...IDENTIDAD_BASE,
        email: 'not-an-email',
        emailVerificado: true,
      });

      expect(result.isFail()).toBe(true);
      const error = result.getError();
      expect(error).toBeInstanceOf(LoginConGoogleFallidoError);
      expect(error.motivo).toBe('email-invalido');
      expect(error.message).toBe('No pudimos iniciar sesión con Google.');
      expect(error.message).not.toContain('not-an-email');
      expect(error.constructor.name).not.toBe('EmailInvalidoError');
      expect(JSON.stringify(error)).not.toContain('not-an-email');
      expect(identidades.buscarPorEmail).not.toHaveBeenCalled();
      expect(identidades.vincularGoogleSub).not.toHaveBeenCalled();
      expect(sessions.crear).not.toHaveBeenCalled();
    });
  });

  describe('AUTH-15 no-enumeration: todas las ramas de fallo son indistinguibles', () => {
    it('las ocho ramas de fallo retornan el MISMO message', async () => {
      const escenarios: Array<{
        identidad: IdentidadExterna;
        identidades: IIdentidadGoogleRepository;
      }> = [
        {
          identidad: IDENTIDAD_BASE,
          identidades: makeMockIdentidades({
            porGoogleSub: {
              userId: 'u',
              esDemo: true,
              googleSub: 'google-sub-abc',
            },
          }),
        },
        {
          identidad: { ...IDENTIDAD_BASE, emailVerificado: false },
          identidades: makeMockIdentidades({ porGoogleSub: null }),
        },
        {
          identidad: IDENTIDAD_BASE,
          identidades: makeMockIdentidades({
            porGoogleSub: null,
            porEmail: null,
          }),
        },
        {
          identidad: IDENTIDAD_BASE,
          identidades: makeMockIdentidades({
            porGoogleSub: null,
            porEmail: { userId: 'u', esDemo: true, googleSub: null },
          }),
        },
        {
          identidad: IDENTIDAD_BASE,
          identidades: makeMockIdentidades({
            porGoogleSub: null,
            porEmail: { userId: 'u', esDemo: false, googleSub: 'otro-sub' },
          }),
        },
        {
          identidad: IDENTIDAD_BASE,
          identidades: makeMockIdentidades({
            porGoogleSub: null,
            porEmail: { userId: 'u', esDemo: false, googleSub: null },
            vincular: false,
          }),
        },
        {
          identidad: { ...IDENTIDAD_BASE, email: null },
          identidades: makeMockIdentidades({ porGoogleSub: null }),
        },
        {
          identidad: { ...IDENTIDAD_BASE, email: 'not-an-email' },
          identidades: makeMockIdentidades({ porGoogleSub: null }),
        },
      ];

      const mensajes = [];
      for (const escenario of escenarios) {
        const { uc } = makeUseCase(escenario.identidades);
        const result = await uc.execute(escenario.identidad);
        expect(result.isFail()).toBe(true);
        mensajes.push(result.getError().message);
      }

      const unico = new Set(mensajes);
      expect(unico.size).toBe(1);
      expect([...unico][0]).toBe('No pudimos iniciar sesión con Google.');
    });
  });

  describe('debug logging (ADR-033 slice A — redaction contract, ADR-013)', () => {
    it('emite eventos debug en cada paso del happy path de link-and-login', async () => {
      const usuario: UsuarioVinculable = {
        userId: 'user-2',
        esDemo: false,
        googleSub: null,
      };
      const identidades = makeMockIdentidades({
        porGoogleSub: null,
        porEmail: usuario,
        vincular: true,
      });
      const logger = new FakeLogger();
      const { uc } = makeUseCase(identidades, logger);

      await uc.execute(IDENTIDAD_BASE);

      const debugMessages = logger.calls
        .filter((c) => c.level === 'debug')
        .map((c) => c.message);
      expect(debugMessages).toEqual([
        'login-con-google: googleSub lookup',
        'login-con-google: email verified check',
        'login-con-google: email lookup',
        'login-con-google: identity link outcome',
        'login-con-google: session emitted',
      ]);
    });

    it('NUNCA incluye el email, el googleSub o un token en los contexts logueados (ADR-013)', async () => {
      const usuario: UsuarioVinculable = {
        userId: 'user-2',
        esDemo: false,
        googleSub: null,
      };
      const identidades = makeMockIdentidades({
        porGoogleSub: null,
        porEmail: usuario,
        vincular: true,
      });
      const logger = new FakeLogger();
      const { uc } = makeUseCase(identidades, logger);

      await uc.execute(IDENTIDAD_BASE);

      const debugCalls = logger.calls.filter((c) => c.level === 'debug');
      expect(debugCalls.length).toBeGreaterThan(0);

      const serializedContexts = JSON.stringify(
        debugCalls.map((c) => c.context),
      );
      // Patrones que NUNCA deben aparecer en un context: '@' (email),
      // 'token'/'Bearer' (credenciales), el sub crudo de la fixture.
      expect(serializedContexts).not.toContain('@');
      expect(serializedContexts).not.toContain('token');
      expect(serializedContexts).not.toContain('Bearer');
      expect(serializedContexts).not.toContain(IDENTIDAD_BASE.sub);
      expect(serializedContexts).not.toContain(IDENTIDAD_BASE.email);
    });
  });
});
