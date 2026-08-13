import { ActualizarPerfilUseCase } from './actualizar-perfil.use-case';
import {
  IUserCredentialRepository,
  IdentidadUsuario,
  CredencialUsuario,
} from '../ports/user-credential-repository.port';
import { IPasswordHasher } from '../ports/password-hasher.port';
import { Email } from '../../domain/value-objects/email';
import { PerfilDemoSoloLecturaError } from '../../domain/errors/perfil-demo-solo-lectura.error';
import { PerfilRechazadoError } from '../../domain/errors/perfil-rechazado.error';
import { NombrePerfilInvalidoError } from '../../domain/errors/nombre-perfil-invalido.error';
import { EmailInvalidoError } from '../../domain/errors/email-invalido.error';
import { EmailNoDisponibleError } from '../../domain/errors/email-no-disponible.error';
import { Result } from '../../shared/result';
import { NoOpLogger, FakeLogger } from '../../../test/support/logger.double';

const IDENTIDAD_OK: IdentidadUsuario = {
  userId: 'user-1',
  nombre: 'Jorge',
  email: 'jorge@example.com',
  esDemo: false,
};

const CREDENCIAL_OK: CredencialUsuario = {
  userId: 'user-1',
  passwordHash: '$argon2id$hash',
};

function makeRepo(
  overrides: Partial<IUserCredentialRepository> = {},
): IUserCredentialRepository {
  return {
    buscarPorEmail: vi.fn(),
    buscarIdentidad: vi.fn(),
    buscarCredencialPorId: vi.fn().mockResolvedValue(CREDENCIAL_OK),
    actualizarPerfil: vi.fn().mockResolvedValue(Result.ok(IDENTIDAD_OK)),
    actualizarPassword: vi.fn(),
    ...overrides,
  };
}

function makeHasher(verificarResult = true): IPasswordHasher {
  return {
    hash: vi.fn(),
    verificar: vi.fn().mockResolvedValue(verificarResult),
  };
}

describe('ActualizarPerfilUseCase', () => {
  it('esDemo=true ⇒ PerfilDemoSoloLecturaError, el repositorio NUNCA se llama (D-05)', async () => {
    const repo = makeRepo();
    const hasher = makeHasher();
    const uc = new ActualizarPerfilUseCase(repo, hasher, new NoOpLogger());

    const result = await uc.execute({
      userId: 'user-1',
      esDemo: true,
      nombre: 'Jorge',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PerfilDemoSoloLecturaError);
    expect(repo.buscarCredencialPorId).not.toHaveBeenCalled();
    expect(repo.actualizarPerfil).not.toHaveBeenCalled();
  });

  describe('nombre-only (sin email)', () => {
    it('NO requiere passwordActual, NO llama buscarCredencialPorId/hasher.verificar, y actualizarPerfil recibe email: undefined', async () => {
      const repo = makeRepo();
      const hasher = makeHasher();
      const uc = new ActualizarPerfilUseCase(repo, hasher, new NoOpLogger());

      const result = await uc.execute({
        userId: 'user-1',
        esDemo: false,
        nombre: 'Jorge Nuevo',
      });

      expect(result.isOk()).toBe(true);
      expect(repo.buscarCredencialPorId).not.toHaveBeenCalled();
      expect(hasher.verificar).not.toHaveBeenCalled();
      expect(repo.actualizarPerfil).toHaveBeenCalledWith({
        userId: 'user-1',
        nombre: 'Jorge Nuevo',
        email: undefined,
      });
    });

    it.each(['', '   ', 'x'.repeat(81)])(
      'rechaza un nombre inválido: %j ⇒ NombrePerfilInvalidoError, sin escritura',
      async (nombre) => {
        const repo = makeRepo();
        const hasher = makeHasher();
        const uc = new ActualizarPerfilUseCase(repo, hasher, new NoOpLogger());

        const result = await uc.execute({
          userId: 'user-1',
          esDemo: false,
          nombre,
        });

        expect(result.isFail()).toBe(true);
        expect(result.getError()).toBeInstanceOf(NombrePerfilInvalidoError);
        expect(repo.actualizarPerfil).not.toHaveBeenCalled();
      },
    );
  });

  describe('email presente', () => {
    it('email inválido ⇒ EmailInvalidoError, antes de cualquier lookup de credencial', async () => {
      const repo = makeRepo();
      const hasher = makeHasher();
      const uc = new ActualizarPerfilUseCase(repo, hasher, new NoOpLogger());

      const result = await uc.execute({
        userId: 'user-1',
        esDemo: false,
        emailRaw: 'no-es-un-email',
        passwordActual: 'lo-que-sea',
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(EmailInvalidoError);
      expect(repo.buscarCredencialPorId).not.toHaveBeenCalled();
    });

    it('passwordActual AUSENTE (schema-bypass — llamando el use case directo) ⇒ PerfilRechazadoError', async () => {
      const repo = makeRepo();
      const hasher = makeHasher();
      const uc = new ActualizarPerfilUseCase(repo, hasher, new NoOpLogger());

      const result = await uc.execute({
        userId: 'user-1',
        esDemo: false,
        emailRaw: 'nuevo@example.com',
        passwordActual: undefined,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PerfilRechazadoError);
      expect(repo.actualizarPerfil).not.toHaveBeenCalled();
    });

    it('buscarCredencialPorId → null (usuario solo-Google, §1/Q3) ⇒ PerfilRechazadoError', async () => {
      const repo = makeRepo({
        buscarCredencialPorId: vi.fn().mockResolvedValue(null),
      });
      const hasher = makeHasher();
      const uc = new ActualizarPerfilUseCase(repo, hasher, new NoOpLogger());

      const result = await uc.execute({
        userId: 'user-1',
        esDemo: false,
        emailRaw: 'nuevo@example.com',
        passwordActual: 'cualquiera',
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PerfilRechazadoError);
      expect(repo.actualizarPerfil).not.toHaveBeenCalled();
    });

    it('passwordActual incorrecto ⇒ PerfilRechazadoError, actualizarPerfil NUNCA se llama', async () => {
      const repo = makeRepo();
      const hasher = makeHasher(false);
      const uc = new ActualizarPerfilUseCase(repo, hasher, new NoOpLogger());

      const result = await uc.execute({
        userId: 'user-1',
        esDemo: false,
        emailRaw: 'nuevo@example.com',
        passwordActual: 'incorrecta',
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PerfilRechazadoError);
      expect(repo.actualizarPerfil).not.toHaveBeenCalled();
    });

    it('el port recibe una instancia de Email (nunca un string), normalizada (trim + lowercase)', async () => {
      const repo = makeRepo();
      const hasher = makeHasher();
      const uc = new ActualizarPerfilUseCase(repo, hasher, new NoOpLogger());

      await uc.execute({
        userId: 'user-1',
        esDemo: false,
        emailRaw: '  Jorge@Example.COM  ',
        passwordActual: 'correcta',
      });

      const callArgs = (repo.actualizarPerfil as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as { email: Email };
      expect(callArgs.email).toBeInstanceOf(Email);
      expect(callArgs.email.valor).toBe('jorge@example.com');
    });

    it('EmailNoDisponibleError del port ⇒ colapsa a PerfilRechazadoError, con el MISMO mensaje que el caso de password incorrecto (D-04, PERF040-04)', async () => {
      const repoRechazoPassword = makeRepo();
      const hasherMalo = makeHasher(false);
      const ucPassword = new ActualizarPerfilUseCase(
        repoRechazoPassword,
        hasherMalo,
        new NoOpLogger(),
      );
      const resultPassword = await ucPassword.execute({
        userId: 'user-1',
        esDemo: false,
        emailRaw: 'nuevo@example.com',
        passwordActual: 'incorrecta',
      });

      const repoEmailTomado = makeRepo({
        actualizarPerfil: vi
          .fn()
          .mockResolvedValue(Result.fail(new EmailNoDisponibleError())),
      });
      const hasherBueno = makeHasher(true);
      const ucEmail = new ActualizarPerfilUseCase(
        repoEmailTomado,
        hasherBueno,
        new NoOpLogger(),
      );
      const resultEmail = await ucEmail.execute({
        userId: 'user-1',
        esDemo: false,
        emailRaw: 'taken@example.com',
        passwordActual: 'correcta',
      });

      expect(resultEmail.isFail()).toBe(true);
      expect(resultEmail.getError()).toBeInstanceOf(PerfilRechazadoError);
      expect(resultEmail.getError().message).toBe(
        resultPassword.getError().message,
      );
    });

    it('happy path: nombre + email juntos ⇒ Result.ok(identidad)', async () => {
      const repo = makeRepo();
      const hasher = makeHasher();
      const uc = new ActualizarPerfilUseCase(repo, hasher, new NoOpLogger());

      const result = await uc.execute({
        userId: 'user-1',
        esDemo: false,
        nombre: 'Jorge',
        emailRaw: 'nuevo@example.com',
        passwordActual: 'correcta',
      });

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toEqual(IDENTIDAD_OK);
    });
  });

  describe('logging (ADR-033/D-07) — nunca un valor de nombre/email/password', () => {
    it('ningún context logueado contiene el nombre, email o password reales', async () => {
      const repo = makeRepo();
      const hasher = makeHasher();
      const logger = new FakeLogger();
      const uc = new ActualizarPerfilUseCase(repo, hasher, logger);

      await uc.execute({
        userId: 'user-1',
        esDemo: false,
        nombre: 'Jorge Secreto',
        emailRaw: 'secreto@example.com',
        passwordActual: 'password-secreta',
      });

      const serialized = JSON.stringify(logger.calls.map((c) => c.context));
      expect(serialized).not.toContain('Jorge Secreto');
      expect(serialized).not.toContain('secreto@example.com');
      expect(serialized).not.toContain('password-secreta');
    });
  });
});
