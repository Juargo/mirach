import { LogoutUseCase } from './logout.use-case';
import { ISessionRepository } from '../ports/session-repository.port';
import { ISessionTokenService } from '../ports/session-token.port';
import { NoOpLogger, FakeLogger } from '../../../test/support/logger.double';

// ──────────────────────────────────────────────────────────────────────────────
// Unit tests — LogoutUseCase (mocked ports). No infra, no DB.
// ──────────────────────────────────────────────────────────────────────────────

function makeMockSessions(): ISessionRepository {
  return {
    crear: vi.fn(),
    buscarPorTokenHash: vi.fn(),
    revocarPorTokenHash: vi.fn().mockResolvedValue(undefined),
    revocarOtrasPorUserId: vi.fn(),
  };
}

function makeMockTokens(hashToken: string): ISessionTokenService {
  return {
    generar: vi.fn(),
    hashToken: vi.fn().mockReturnValue(hashToken),
  };
}

describe('LogoutUseCase', () => {
  it('token present → revokes the session identified by its tokenHash', async () => {
    const sessions = makeMockSessions();
    const tokens = makeMockTokens('hashed-token');
    const uc = new LogoutUseCase(sessions, tokens, new NoOpLogger());

    const result = await uc.execute({ token: 'raw-token' });

    expect(result.isOk()).toBe(true);
    expect(tokens.hashToken).toHaveBeenCalledWith('raw-token');
    expect(sessions.revocarPorTokenHash).toHaveBeenCalledWith('hashed-token');
  });

  it('token undefined → idempotent Result.ok, no revocation attempted', async () => {
    const sessions = makeMockSessions();
    const tokens = makeMockTokens('hashed-token');
    const uc = new LogoutUseCase(sessions, tokens, new NoOpLogger());

    const result = await uc.execute({ token: undefined });

    expect(result.isOk()).toBe(true);
    expect(sessions.revocarPorTokenHash).not.toHaveBeenCalled();
    expect(tokens.hashToken).not.toHaveBeenCalled();
  });

  describe('debug logging (ADR-033 slice A — redaction contract, ADR-013)', () => {
    it('NUNCA incluye el token crudo ni su hash en los contexts logueados', async () => {
      const sessions = makeMockSessions();
      const tokens = makeMockTokens('hashed-token');
      const logger = new FakeLogger();
      const uc = new LogoutUseCase(sessions, tokens, logger);

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
