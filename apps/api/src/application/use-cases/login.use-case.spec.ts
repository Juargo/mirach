import { LoginUseCase, HASH_DUMMY_PARA_TIMING } from './login.use-case';
import {
  IUserCredentialRepository,
  CredencialUsuario,
} from '../ports/user-credential-repository.port';
import { IPasswordHasher } from '../ports/password-hasher.port';
import { ISessionRepository } from '../ports/session-repository.port';
import { ISessionTokenService, TokenGenerado } from '../ports/session-token.port';
import { IReloj } from '../ports/reloj.port';
import { CredencialesInvalidasError } from '../../domain/errors/credenciales-invalidas.error';

// ──────────────────────────────────────────────────────────────────────────────
// Unit tests — LoginUseCase (mocked ports, fake clock). No infra, no DB.
// ──────────────────────────────────────────────────────────────────────────────

function makeMockCreds(row: CredencialUsuario | null): IUserCredentialRepository {
  return {
    buscarPorEmail: vi.fn().mockResolvedValue(row),
    buscarIdentidad: vi.fn(),
  };
}

function makeMockHasher(verificarResult: boolean): IPasswordHasher {
  return {
    hash: vi.fn(),
    verificar: vi.fn().mockResolvedValue(verificarResult),
  };
}

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

const AHORA = new Date('2026-07-15T00:00:00.000Z');
const TOKEN_GENERADO: TokenGenerado = {
  token: 'raw-token-abc',
  tokenHash: 'hashed-token-abc',
};

describe('LoginUseCase', () => {
  describe('success', () => {
    it('persists a session and returns { token, userId, expiresAt }', async () => {
      const cred: CredencialUsuario = {
        userId: 'user-1',
        passwordHash: 'stored-hash',
      };
      const creds = makeMockCreds(cred);
      const hasher = makeMockHasher(true);
      const sessions = makeMockSessions();
      const tokens = makeMockTokens(TOKEN_GENERADO);
      const reloj = makeFakeReloj(AHORA);
      const uc = new LoginUseCase(creds, hasher, sessions, tokens, reloj);

      const result = await uc.execute({
        emailRaw: 'jorge@example.com',
        password: 'correct-password',
      });

      expect(result.isOk()).toBe(true);
      const value = result.getValue();
      expect(value.token).toBe('raw-token-abc');
      expect(value.userId).toBe('user-1');
      expect(value.expiresAt.toISOString()).toBe('2026-07-22T00:00:00.000Z');

      expect(sessions.crear).toHaveBeenCalledWith({
        userId: 'user-1',
        tokenHash: 'hashed-token-abc',
        expiresAt: value.expiresAt,
      });
      expect(hasher.verificar).toHaveBeenCalledWith(
        'correct-password',
        'stored-hash',
      );
    });
  });

  describe('unknown email (AUTH-02 no-enumeration)', () => {
    it('returns CredencialesInvalidasError AND still invokes a dummy verificar', async () => {
      const creds = makeMockCreds(null);
      const hasher = makeMockHasher(false);
      const sessions = makeMockSessions();
      const tokens = makeMockTokens(TOKEN_GENERADO);
      const reloj = makeFakeReloj(AHORA);
      const uc = new LoginUseCase(creds, hasher, sessions, tokens, reloj);

      const result = await uc.execute({
        emailRaw: 'nobody@example.com',
        password: 'whatever',
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CredencialesInvalidasError);
      // Timing equalization: verificar runs on the unknown-email path too.
      expect(hasher.verificar).toHaveBeenCalledTimes(1);
      expect(hasher.verificar).toHaveBeenCalledWith('whatever', expect.any(String));
      expect(sessions.crear).not.toHaveBeenCalled();
    });
  });

  describe('wrong password', () => {
    it('returns the identical CredencialesInvalidasError as the unknown-email case', async () => {
      const cred: CredencialUsuario = {
        userId: 'user-1',
        passwordHash: 'stored-hash',
      };
      const creds = makeMockCreds(cred);
      const hasher = makeMockHasher(false);
      const sessions = makeMockSessions();
      const tokens = makeMockTokens(TOKEN_GENERADO);
      const reloj = makeFakeReloj(AHORA);
      const uc = new LoginUseCase(creds, hasher, sessions, tokens, reloj);

      const result = await uc.execute({
        emailRaw: 'jorge@example.com',
        password: 'wrong-password',
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CredencialesInvalidasError);
      expect(result.getError().message).toBe('Credenciales inválidas.');
      expect(sessions.crear).not.toHaveBeenCalled();
    });
  });

  describe('invalid email format', () => {
    it('returns the identical error AND still invokes a dummy verificar (no distinct code path)', async () => {
      const creds = makeMockCreds(null);
      const hasher = makeMockHasher(false);
      const sessions = makeMockSessions();
      const tokens = makeMockTokens(TOKEN_GENERADO);
      const reloj = makeFakeReloj(AHORA);
      const uc = new LoginUseCase(creds, hasher, sessions, tokens, reloj);

      const result = await uc.execute({
        emailRaw: 'not-an-email',
        password: 'whatever',
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CredencialesInvalidasError);
      expect(creds.buscarPorEmail).not.toHaveBeenCalled();
      expect(hasher.verificar).toHaveBeenCalledTimes(1);
      expect(sessions.crear).not.toHaveBeenCalled();
    });
  });

  describe('AUTH-02 no-enumeration: las 3 ramas de fallo son indistinguibles', () => {
    it('email desconocido / email inválido / contraseña incorrecta retornan el MISMO error (message + name)', async () => {
      const sessions = makeMockSessions();
      const tokens = makeMockTokens(TOKEN_GENERADO);
      const reloj = makeFakeReloj(AHORA);

      // Rama 1: email con formato inválido (no llega al repo).
      const ucInvalido = new LoginUseCase(
        makeMockCreds(null),
        makeMockHasher(false),
        sessions,
        tokens,
        reloj,
      );
      const rInvalido = await ucInvalido.execute({
        emailRaw: 'no-es-un-email',
        password: 'x',
      });

      // Rama 2: email bien formado pero desconocido (repo retorna null).
      const ucDesconocido = new LoginUseCase(
        makeMockCreds(null),
        makeMockHasher(false),
        sessions,
        tokens,
        reloj,
      );
      const rDesconocido = await ucDesconocido.execute({
        emailRaw: 'nadie@example.com',
        password: 'x',
      });

      // Rama 3: email conocido, contraseña incorrecta (hasher retorna false).
      const ucPassMala = new LoginUseCase(
        makeMockCreds({ userId: 'user-1', passwordHash: 'stored-hash' }),
        makeMockHasher(false),
        sessions,
        tokens,
        reloj,
      );
      const rPassMala = await ucPassMala.execute({
        emailRaw: 'user@example.com',
        password: 'incorrecta',
      });

      expect(rInvalido.isFail()).toBe(true);
      expect(rDesconocido.isFail()).toBe(true);
      expect(rPassMala.isFail()).toBe(true);

      const eInvalido = rInvalido.getError();
      const eDesconocido = rDesconocido.getError();
      const ePassMala = rPassMala.getError();

      // Indistinguibilidad total: mismo name y mismo message en las 3 ramas.
      expect(eDesconocido.name).toBe(eInvalido.name);
      expect(ePassMala.name).toBe(eInvalido.name);
      expect(eDesconocido.message).toBe(eInvalido.message);
      expect(ePassMala.message).toBe(eInvalido.message);
    });
  });

  describe('HASH_DUMMY_PARA_TIMING (AUTH-02 timing equalization)', () => {
    // Application layer never imports infra (Clean Architecture), so this
    // asserts the hardcoded params directly rather than importing
    // Argon2PasswordHasher's ARGON2_OPTIONS — the infra-side test
    // (argon2-password-hasher.spec.ts) is the one that pins the real hasher's
    // output to the SAME literal. Keep both in sync if either changes.
    it('codifica m=19456,t=2,p=1 — deben coincidir con ARGON2_OPTIONS del hasher real', () => {
      expect(HASH_DUMMY_PARA_TIMING).toContain('m=19456,t=2,p=1');
    });
  });
});
