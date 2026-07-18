import { LogoutUseCase } from './logout.use-case';
import { ISessionRepository } from '../ports/session-repository.port';
import { ISessionTokenService } from '../ports/session-token.port';

// ──────────────────────────────────────────────────────────────────────────────
// Unit tests — LogoutUseCase (mocked ports). No infra, no DB.
// ──────────────────────────────────────────────────────────────────────────────

function makeMockSessions(): ISessionRepository {
  return {
    crear: vi.fn(),
    buscarPorTokenHash: vi.fn(),
    revocarPorTokenHash: vi.fn().mockResolvedValue(undefined),
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
    const uc = new LogoutUseCase(sessions, tokens);

    const result = await uc.execute({ token: 'raw-token' });

    expect(result.isOk()).toBe(true);
    expect(tokens.hashToken).toHaveBeenCalledWith('raw-token');
    expect(sessions.revocarPorTokenHash).toHaveBeenCalledWith('hashed-token');
  });

  it('token undefined → idempotent Result.ok, no revocation attempted', async () => {
    const sessions = makeMockSessions();
    const tokens = makeMockTokens('hashed-token');
    const uc = new LogoutUseCase(sessions, tokens);

    const result = await uc.execute({ token: undefined });

    expect(result.isOk()).toBe(true);
    expect(sessions.revocarPorTokenHash).not.toHaveBeenCalled();
    expect(tokens.hashToken).not.toHaveBeenCalled();
  });
});
