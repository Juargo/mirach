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
  it('valid token (not expired) → Result.ok({ userId, tokenHash })', async () => {
    const sesion: SesionPersistida = {
      userId: 'user-1',
      expiresAt: new Date('2026-07-22T00:00:00.000Z'),
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
      tokenHash: 'hashed-token',
    });
    expect(tokens.hashToken).toHaveBeenCalledWith('raw-token');
    expect(sessions.buscarPorTokenHash).toHaveBeenCalledWith('hashed-token');
  });

  it('tokenHash devuelto ES el valor que tokens.hashToken() ya computó — no es un re-hash (PERF040-06)', async () => {
    const sesion: SesionPersistida = {
      userId: 'user-1',
      expiresAt: new Date('2026-07-22T00:00:00.000Z'),
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

describe('ValidarSesionUseCase — anonymous session renewal (ADR-013)', () => {
  const AHORA = new Date('2026-11-12T00:00:00.000Z');
  const DIA_MS = 24 * 60 * 60 * 1000;

  function armar(sesion: SesionPersistida, renovar = vi.fn()) {
    const sessions = makeMockSessions(sesion);
    const uc = new ValidarSesionUseCase(
      sessions,
      makeMockTokens('hashed-token'),
      makeFakeReloj(AHORA),
      new NoOpLogger(),
      { renovar },
    );
    return { uc, renovar };
  }

  it('extends an anonymous session to 365 days from now when more than a day was used', async () => {
    const { uc, renovar } = armar({
      userId: 'anon-1',
      expiresAt: new Date(AHORA.getTime() + 300 * DIA_MS),
      anonima: true,
    });

    const result = await uc.execute({ token: 'raw-token' });

    expect(result.getValue()).toEqual({
      userId: 'anon-1',
      tokenHash: 'hashed-token',
    });
    expect(renovar).toHaveBeenCalledTimes(1);
    expect(renovar).toHaveBeenCalledWith(
      'hashed-token',
      new Date('2027-11-12T00:00:00.000Z'),
    );
  });

  it('does not write again within a day of the last renewal', async () => {
    const { uc, renovar } = armar({
      userId: 'anon-1',
      expiresAt: new Date(AHORA.getTime() + 365 * DIA_MS - 1000),
      anonima: true,
    });

    await uc.execute({ token: 'raw-token' });

    expect(renovar).not.toHaveBeenCalled();
  });

  it('never extends the session of an account with credentials', async () => {
    const { uc, renovar } = armar({
      userId: 'user-1',
      expiresAt: new Date(AHORA.getTime() + 2 * DIA_MS),
      anonima: false,
    });

    const result = await uc.execute({ token: 'raw-token' });

    expect(result.isOk()).toBe(true);
    expect(renovar).not.toHaveBeenCalled();
  });

  it('never revives an expired anonymous session', async () => {
    const { uc, renovar } = armar({
      userId: 'anon-1',
      expiresAt: AHORA,
      anonima: true,
    });

    const result = await uc.execute({ token: 'raw-token' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(SesionInvalidaError);
    expect(renovar).not.toHaveBeenCalled();
  });

  it('a failed renewal does not reject a valid session', async () => {
    const { uc } = armar(
      {
        userId: 'anon-1',
        expiresAt: new Date(AHORA.getTime() + 300 * DIA_MS),
        anonima: true,
      },
      vi.fn().mockRejectedValue(new Error('db down')),
    );

    const result = await uc.execute({ token: 'raw-token' });

    expect(result.isOk()).toBe(true);
  });
});
