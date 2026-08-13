import { CambiarPasswordUseCase } from './cambiar-password.use-case';
import {
  IUserCredentialRepository,
  CredencialUsuario,
} from '../ports/user-credential-repository.port';
import { ISessionRepository } from '../ports/session-repository.port';
import { IPasswordHasher } from '../ports/password-hasher.port';
import { PerfilDemoSoloLecturaError } from '../../domain/errors/perfil-demo-solo-lectura.error';
import { PerfilRechazadoError } from '../../domain/errors/perfil-rechazado.error';
import { PasswordInvalidaError } from '../../domain/errors/password-invalida.error';
import { NoOpLogger, FakeLogger } from '../../../test/support/logger.double';

const CREDENCIAL_OK: CredencialUsuario = {
  userId: 'user-1',
  passwordHash: '$argon2id$hash-actual',
};

function makeCreds(
  overrides: Partial<IUserCredentialRepository> = {},
): IUserCredentialRepository {
  return {
    buscarPorEmail: vi.fn(),
    buscarIdentidad: vi.fn(),
    buscarCredencialPorId: vi.fn().mockResolvedValue(CREDENCIAL_OK),
    actualizarPerfil: vi.fn(),
    actualizarPassword: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeSessions(
  overrides: Partial<ISessionRepository> = {},
): ISessionRepository {
  return {
    crear: vi.fn(),
    buscarPorTokenHash: vi.fn(),
    revocarPorTokenHash: vi.fn(),
    revocarOtrasPorUserId: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeHasher(overrides: Partial<IPasswordHasher> = {}): IPasswordHasher {
  return {
    hash: vi.fn().mockResolvedValue('$argon2id$hash-nuevo'),
    verificar: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

const INPUT_BASE = {
  userId: 'user-1',
  esDemo: false,
  tokenHashActual: 'hash-de-la-sesion-A',
  passwordActual: 'clave-actual-valida',
  passwordNueva: 'clave-nueva-valida',
};

describe('CambiarPasswordUseCase', () => {
  it('esDemo=true ⇒ PerfilDemoSoloLecturaError, NINGÚN repositorio se llama (D-05)', async () => {
    const creds = makeCreds();
    const sessions = makeSessions();
    const uc = new CambiarPasswordUseCase(
      creds,
      sessions,
      makeHasher(),
      new NoOpLogger(),
    );

    const result = await uc.execute({ ...INPUT_BASE, esDemo: true });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PerfilDemoSoloLecturaError);
    expect(creds.buscarCredencialPorId).not.toHaveBeenCalled();
    expect(sessions.revocarOtrasPorUserId).not.toHaveBeenCalled();
    expect(creds.actualizarPassword).not.toHaveBeenCalled();
  });

  it('buscarCredencialPorId → null ⇒ PerfilRechazadoError (usuario solo-Google, §1/Q3)', async () => {
    const creds = makeCreds({
      buscarCredencialPorId: vi.fn().mockResolvedValue(null),
    });
    const sessions = makeSessions();
    const uc = new CambiarPasswordUseCase(
      creds,
      sessions,
      makeHasher(),
      new NoOpLogger(),
    );

    const result = await uc.execute(INPUT_BASE);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PerfilRechazadoError);
  });

  it('password actual incorrecta ⇒ PerfilRechazadoError, NI revocarOtrasPorUserId NI actualizarPassword se llaman (PERF040-03)', async () => {
    const creds = makeCreds();
    const sessions = makeSessions();
    const hasher = makeHasher({ verificar: vi.fn().mockResolvedValue(false) });
    const uc = new CambiarPasswordUseCase(
      creds,
      sessions,
      hasher,
      new NoOpLogger(),
    );

    const result = await uc.execute(INPUT_BASE);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PerfilRechazadoError);
    expect(sessions.revocarOtrasPorUserId).not.toHaveBeenCalled();
    expect(creds.actualizarPassword).not.toHaveBeenCalled();
  });

  it('passwordNueva demasiado corta ⇒ PasswordInvalidaError DESPUÉS de verificar, sin ninguna escritura', async () => {
    const creds = makeCreds();
    const sessions = makeSessions();
    const uc = new CambiarPasswordUseCase(
      creds,
      sessions,
      makeHasher(),
      new NoOpLogger(),
    );

    const result = await uc.execute({ ...INPUT_BASE, passwordNueva: 'corta' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PasswordInvalidaError);
    expect(creds.buscarCredencialPorId).toHaveBeenCalled(); // verify ran first
    expect(sessions.revocarOtrasPorUserId).not.toHaveBeenCalled();
    expect(creds.actualizarPassword).not.toHaveBeenCalled();
  });

  describe('happy path', () => {
    it('revocarOtrasPorUserId se llama ANTES que actualizarPassword — invocation-order, no dos toHaveBeenCalled independientes (§4.3/F3)', async () => {
      const orden: string[] = [];
      const creds = makeCreds({
        actualizarPassword: vi.fn().mockImplementation(async () => {
          orden.push('actualizarPassword');
        }),
      });
      const sessions = makeSessions({
        revocarOtrasPorUserId: vi.fn().mockImplementation(async () => {
          orden.push('revocarOtrasPorUserId');
        }),
      });
      const uc = new CambiarPasswordUseCase(
        creds,
        sessions,
        makeHasher(),
        new NoOpLogger(),
      );

      const result = await uc.execute(INPUT_BASE);

      expect(result.isOk()).toBe(true);
      expect(orden).toEqual(['revocarOtrasPorUserId', 'actualizarPassword']);
    });

    it('revocarOtrasPorUserId recibe EXACTAMENTE input.tokenHashActual (pins the F7 empty-string pass-through)', async () => {
      const creds = makeCreds();
      const sessions = makeSessions();
      const uc = new CambiarPasswordUseCase(
        creds,
        sessions,
        makeHasher(),
        new NoOpLogger(),
      );

      await uc.execute({ ...INPUT_BASE, tokenHashActual: '' });

      expect(sessions.revocarOtrasPorUserId).toHaveBeenCalledWith('user-1', '');
    });

    it('el valor pasado a actualizarPassword es la salida del hasher, NUNCA el texto plano', async () => {
      const creds = makeCreds();
      const sessions = makeSessions();
      const hasher = makeHasher({
        hash: vi.fn().mockResolvedValue('$argon2id$totalmente-distinto'),
      });
      const uc = new CambiarPasswordUseCase(
        creds,
        sessions,
        hasher,
        new NoOpLogger(),
      );

      await uc.execute(INPUT_BASE);

      expect(creds.actualizarPassword).toHaveBeenCalledWith(
        'user-1',
        '$argon2id$totalmente-distinto',
      );
      expect(hasher.hash).toHaveBeenCalledWith(INPUT_BASE.passwordNueva);
    });

    it('Result.ok(undefined) en éxito', async () => {
      const creds = makeCreds();
      const sessions = makeSessions();
      const uc = new CambiarPasswordUseCase(
        creds,
        sessions,
        makeHasher(),
        new NoOpLogger(),
      );

      const result = await uc.execute(INPUT_BASE);

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toBeUndefined();
    });
  });

  describe('debug logging (D-07 — solo booleanos/nombres de campo, nunca valores)', () => {
    it('ningún log lleva la password (actual o nueva), el hash o el token', async () => {
      const creds = makeCreds();
      const sessions = makeSessions();
      const hasher = makeHasher();
      const logger = new FakeLogger();
      const uc = new CambiarPasswordUseCase(creds, sessions, hasher, logger);

      await uc.execute(INPUT_BASE);

      const serialized = JSON.stringify(logger.calls.map((c) => c.context));
      expect(serialized).not.toContain(INPUT_BASE.passwordActual);
      expect(serialized).not.toContain(INPUT_BASE.passwordNueva);
      expect(serialized).not.toContain(INPUT_BASE.tokenHashActual);
      expect(serialized).not.toContain('$argon2id$hash-nuevo');
    });
  });
});
