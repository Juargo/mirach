import { ValidarSesionUseCase } from './validar-sesion.use-case';
import {
  ISessionRepository,
  SesionPersistida,
} from '../ports/session-repository.port';
import { ISessionTokenService } from '../ports/session-token.port';
import { IReloj } from '../ports/reloj.port';
import { SesionInvalidaError } from '../../domain/errors/sesion-invalida.error';
import { NoOpLogger, FakeLogger } from '../../../test/support/logger.double';

// ──────────────────────────────────────────────────────────────────────────────
// Unit tests — ValidarSesionUseCase (mocked ports, fake clock). No infra, no DB.
// ──────────────────────────────────────────────────────────────────────────────

function makeMockSessions(found: SesionPersistida | null): ISessionRepository {
  return {
    crear: vi.fn(),
    buscarPorTokenHash: vi.fn().mockResolvedValue(found),
    revocarPorTokenHash: vi.fn(),
    revocarOtrasPorUserId: vi.fn(),
  };
}

function makeMockTokens(hashToken: string): ISessionTokenService {
  return {
    generar: vi.fn(),
    hashToken: vi.fn().mockReturnValue(hashToken),
  };
}

function makeFakeReloj(ahora: Date): IReloj {
  return { ahora: () => ahora };
}

describe('ValidarSesionUseCase', () => {
  it('valid token (not expired) → Result.ok({ userId, esDemo, tokenHash })', async () => {
    const sesion: SesionPersistida = {
      userId: 'user-1',
      expiresAt: new Date('2026-07-22T00:00:00.000Z'),
      esDemo: false,
    };
    const sessions = makeMockSessions(sesion);
    const tokens = makeMockTokens('hashed-token');
    const reloj = makeFakeReloj(new Date('2026-07-15T00:00:00.000Z'));
    const uc = new ValidarSesionUseCase(
      sessions,
      tokens,
      reloj,
      new NoOpLogger(),
    );

    const result = await uc.execute({ token: 'raw-token' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual({
      userId: 'user-1',
      esDemo: false,
      tokenHash: 'hashed-token',
    });
    expect(tokens.hashToken).toHaveBeenCalledWith('raw-token');
    expect(sessions.buscarPorTokenHash).toHaveBeenCalledWith('hashed-token');
  });

  it('tokenHash devuelto ES el valor que tokens.hashToken() ya computó — no es un re-hash (PERF040-06)', async () => {
    const sesion: SesionPersistida = {
      userId: 'user-1',
      expiresAt: new Date('2026-07-22T00:00:00.000Z'),
      esDemo: false,
    };
    const sessions = makeMockSessions(sesion);
    const tokens = makeMockTokens('el-hash-ya-computado');
    const reloj = makeFakeReloj(new Date('2026-07-15T00:00:00.000Z'));
    const uc = new ValidarSesionUseCase(
      sessions,
      tokens,
      reloj,
      new NoOpLogger(),
    );

    const result = await uc.execute({ token: 'raw-token' });

    expect(result.getValue().tokenHash).toBe('el-hash-ya-computado');
    expect(tokens.hashToken).toHaveBeenCalledTimes(1);
  });

  it('sesión demo (not expired) → Result.ok({ userId, esDemo: true, tokenHash }) (CAT038-08)', async () => {
    const sesion: SesionPersistida = {
      userId: 'user-demo',
      expiresAt: new Date('2026-07-22T00:00:00.000Z'),
      esDemo: true,
    };
    const sessions = makeMockSessions(sesion);
    const tokens = makeMockTokens('hashed-token');
    const reloj = makeFakeReloj(new Date('2026-07-15T00:00:00.000Z'));
    const uc = new ValidarSesionUseCase(
      sessions,
      tokens,
      reloj,
      new NoOpLogger(),
    );

    const result = await uc.execute({ token: 'raw-token' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual({
      userId: 'user-demo',
      esDemo: true,
      tokenHash: 'hashed-token',
    });
  });

  it('unknown tokenHash (no matching session) → Result.fail(SesionInvalidaError)', async () => {
    const sessions = makeMockSessions(null);
    const tokens = makeMockTokens('hashed-token');
    const reloj = makeFakeReloj(new Date('2026-07-15T00:00:00.000Z'));
    const uc = new ValidarSesionUseCase(
      sessions,
      tokens,
      reloj,
      new NoOpLogger(),
    );

    const result = await uc.execute({ token: 'garbage-token' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(SesionInvalidaError);
  });

  it('expired session (ahora >= expiresAt) → Result.fail(SesionInvalidaError)', async () => {
    const sesion: SesionPersistida = {
      userId: 'user-1',
      expiresAt: new Date('2026-07-15T00:00:00.000Z'),
      esDemo: false,
    };
    const sessions = makeMockSessions(sesion);
    const tokens = makeMockTokens('hashed-token');
    // fake clock past expiresAt
    const reloj = makeFakeReloj(new Date('2026-07-16T00:00:00.000Z'));
    const uc = new ValidarSesionUseCase(
      sessions,
      tokens,
      reloj,
      new NoOpLogger(),
    );

    const result = await uc.execute({ token: 'raw-token' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(SesionInvalidaError);
  });

  describe('debug logging (ADR-033 slice A — redaction contract, ADR-013)', () => {
    it('NUNCA incluye el token crudo ni su hash en los contexts logueados', async () => {
      const sesion: SesionPersistida = {
        userId: 'user-1',
        expiresAt: new Date('2026-07-22T00:00:00.000Z'),
        esDemo: false,
      };
      const sessions = makeMockSessions(sesion);
      const tokens = makeMockTokens('hashed-token');
      const reloj = makeFakeReloj(new Date('2026-07-15T00:00:00.000Z'));
      const logger = new FakeLogger();
      const uc = new ValidarSesionUseCase(sessions, tokens, reloj, logger);

      await uc.execute({ token: 'raw-token' });

      const debugCalls = logger.calls.filter((c) => c.level === 'debug');
      expect(debugCalls.length).toBeGreaterThan(0);

      const serializedContexts = JSON.stringify(
        debugCalls.map((c) => c.context),
      );
      expect(serializedContexts).not.toContain('@');
      expect(serializedContexts).not.toContain('raw-token');
      expect(serializedContexts).not.toContain('hashed-token');
    });
  });
});
