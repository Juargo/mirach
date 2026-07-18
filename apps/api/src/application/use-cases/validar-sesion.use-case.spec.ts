import { ValidarSesionUseCase } from './validar-sesion.use-case';
import {
  ISessionRepository,
  SesionPersistida,
} from '../ports/session-repository.port';
import { ISessionTokenService } from '../ports/session-token.port';
import { IReloj } from '../ports/reloj.port';
import { SesionInvalidaError } from '../../domain/errors/sesion-invalida.error';

// ──────────────────────────────────────────────────────────────────────────────
// Unit tests — ValidarSesionUseCase (mocked ports, fake clock). No infra, no DB.
// ──────────────────────────────────────────────────────────────────────────────

function makeMockSessions(
  found: SesionPersistida | null,
): ISessionRepository {
  return {
    crear: vi.fn(),
    buscarPorTokenHash: vi.fn().mockResolvedValue(found),
    revocarPorTokenHash: vi.fn(),
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
  it('valid token (not expired) → Result.ok({ userId })', async () => {
    const sesion: SesionPersistida = {
      userId: 'user-1',
      expiresAt: new Date('2026-07-22T00:00:00.000Z'),
    };
    const sessions = makeMockSessions(sesion);
    const tokens = makeMockTokens('hashed-token');
    const reloj = makeFakeReloj(new Date('2026-07-15T00:00:00.000Z'));
    const uc = new ValidarSesionUseCase(sessions, tokens, reloj);

    const result = await uc.execute({ token: 'raw-token' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual({ userId: 'user-1' });
    expect(tokens.hashToken).toHaveBeenCalledWith('raw-token');
    expect(sessions.buscarPorTokenHash).toHaveBeenCalledWith('hashed-token');
  });

  it('unknown tokenHash (no matching session) → Result.fail(SesionInvalidaError)', async () => {
    const sessions = makeMockSessions(null);
    const tokens = makeMockTokens('hashed-token');
    const reloj = makeFakeReloj(new Date('2026-07-15T00:00:00.000Z'));
    const uc = new ValidarSesionUseCase(sessions, tokens, reloj);

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
    const uc = new ValidarSesionUseCase(sessions, tokens, reloj);

    const result = await uc.execute({ token: 'raw-token' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(SesionInvalidaError);
  });
});
