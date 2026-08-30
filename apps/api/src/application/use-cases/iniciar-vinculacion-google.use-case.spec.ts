import { IniciarVinculacionGoogleUseCase } from './iniciar-vinculacion-google.use-case';
import {
  IUserCredentialRepository,
  CredencialUsuario,
} from '../ports/user-credential-repository.port';
import {
  IIdentidadGoogleRepository,
  UsuarioVinculable,
} from '../ports/identidad-google-repository.port';
import { IIniciadorLoginExterno } from '../ports/verificador-identidad-externa.port';
import { IPasswordHasher } from '../ports/password-hasher.port';
import { PerfilDemoSoloLecturaError } from '../../domain/errors/perfil-demo-solo-lectura.error';
import { PerfilRechazadoError } from '../../domain/errors/perfil-rechazado.error';
import { GoogleYaVinculadoError } from '../../domain/errors/google-ya-vinculado.error';
import { VinculacionGoogleNoDisponibleError } from '../../domain/errors/vinculacion-google-no-disponible.error';
import { VerificacionIdentidadFallidaError } from '../../domain/errors/verificacion-identidad-fallida.error';
import { Result } from '../../shared/result';
import { FakeLogger } from '../../../test/support/logger.double';

const CREDENCIAL_OK: CredencialUsuario = {
  userId: 'user-1',
  passwordHash: '$argon2id$hash',
};

const NO_VINCULADO: UsuarioVinculable = {
  userId: 'user-1',
  esDemo: false,
  googleSub: null,
};

const YA_VINCULADO: UsuarioVinculable = {
  userId: 'user-1',
  esDemo: false,
  googleSub: 'sub-existente',
};

const INICIO_OK = {
  urlAutorizacion: 'https://accounts.google.com/o/oauth2/v2/auth?x=1',
  state: 's1',
  nonce: 'n1',
  codeVerifier: 'v1',
};

function makeCreds(
  overrides: Partial<IUserCredentialRepository> = {},
): IUserCredentialRepository {
  return {
    buscarPorEmail: vi.fn(),
    buscarIdentidad: vi.fn(),
    buscarCredencialPorId: vi.fn().mockResolvedValue(CREDENCIAL_OK),
    actualizarPerfil: vi.fn(),
    actualizarPassword: vi.fn(),
    ...overrides,
  };
}

function makeIdentidades(
  overrides: Partial<IIdentidadGoogleRepository> = {},
): IIdentidadGoogleRepository {
  return {
    buscarPorGoogleSub: vi.fn(),
    buscarPorEmail: vi.fn(),
    vincularGoogleSub: vi.fn(),
    buscarPorId: vi.fn().mockResolvedValue(NO_VINCULADO),
    desvincularGoogleSub: vi.fn(),
    crearDesdeGoogle: vi.fn(),
    ...overrides,
  };
}

function makeIniciador(
  overrides: Partial<IIniciadorLoginExterno> = {},
): IIniciadorLoginExterno {
  return {
    iniciar: vi.fn().mockResolvedValue(Result.ok(INICIO_OK)),
    ...overrides,
  };
}

function makeHasher(verificarResult = true): IPasswordHasher {
  return {
    hash: vi.fn(),
    verificar: vi.fn().mockResolvedValue(verificarResult),
  };
}

function makeUseCase(deps: {
  creds?: IUserCredentialRepository;
  identidades?: IIdentidadGoogleRepository;
  iniciador?: IIniciadorLoginExterno;
  hasher?: IPasswordHasher;
  logger?: FakeLogger;
}): {
  uc: IniciarVinculacionGoogleUseCase;
  creds: IUserCredentialRepository;
  identidades: IIdentidadGoogleRepository;
  iniciador: IIniciadorLoginExterno;
  hasher: IPasswordHasher;
  logger: FakeLogger;
} {
  const creds = deps.creds ?? makeCreds();
  const identidades = deps.identidades ?? makeIdentidades();
  const iniciador = deps.iniciador ?? makeIniciador();
  const hasher = deps.hasher ?? makeHasher();
  const logger = deps.logger ?? new FakeLogger();
  return {
    uc: new IniciarVinculacionGoogleUseCase(
      creds,
      identidades,
      iniciador,
      hasher,
      logger,
    ),
    creds,
    identidades,
    iniciador,
    hasher,
    logger,
  };
}

describe('IniciarVinculacionGoogleUseCase', () => {
  it('esDemo=true ⇒ PerfilDemoSoloLecturaError, y NI el repo NI el hasher NI el iniciador se llaman', async () => {
    const { uc, creds, identidades, iniciador, hasher } = makeUseCase({});

    const result = await uc.execute({
      userId: 'user-1',
      esDemo: true,
      passwordActual: 'x',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PerfilDemoSoloLecturaError);
    expect(creds.buscarCredencialPorId).not.toHaveBeenCalled();
    expect(identidades.buscarPorId).not.toHaveBeenCalled();
    expect(iniciador.iniciar).not.toHaveBeenCalled();
    expect(hasher.verificar).not.toHaveBeenCalled();
  });

  it('credencial null ⇒ PerfilRechazadoError, y el iniciador NUNCA se llama', async () => {
    const { uc, iniciador } = makeUseCase({
      creds: makeCreds({
        buscarCredencialPorId: vi.fn().mockResolvedValue(null),
      }),
    });

    const result = await uc.execute({
      userId: 'user-1',
      esDemo: false,
      passwordActual: 'x',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PerfilRechazadoError);
    expect(iniciador.iniciar).not.toHaveBeenCalled();
  });

  it('password incorrecta ⇒ PerfilRechazadoError, y identidades.buscarPorId NUNCA se llama (prueba el orden de §P1: password ANTES del pre-flight 409)', async () => {
    const { uc, identidades, iniciador } = makeUseCase({
      hasher: makeHasher(false),
    });

    const result = await uc.execute({
      userId: 'user-1',
      esDemo: false,
      passwordActual: 'incorrecta',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PerfilRechazadoError);
    expect(identidades.buscarPorId).not.toHaveBeenCalled();
    expect(iniciador.iniciar).not.toHaveBeenCalled();
  });

  it('ya tiene googleSub ⇒ GoogleYaVinculadoError, y el iniciador NUNCA se llama', async () => {
    const { uc, iniciador } = makeUseCase({
      identidades: makeIdentidades({
        buscarPorId: vi.fn().mockResolvedValue(YA_VINCULADO),
      }),
    });

    const result = await uc.execute({
      userId: 'user-1',
      esDemo: false,
      passwordActual: 'correcta',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(GoogleYaVinculadoError);
    expect(iniciador.iniciar).not.toHaveBeenCalled();
  });

  it('fila de identidad null (vanished mid-request) ⇒ PerfilRechazadoError genérico', async () => {
    const { uc } = makeUseCase({
      identidades: makeIdentidades({
        buscarPorId: vi.fn().mockResolvedValue(null),
      }),
    });

    const result = await uc.execute({
      userId: 'user-1',
      esDemo: false,
      passwordActual: 'correcta',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PerfilRechazadoError);
  });

  it('iniciador.iniciar() falla ⇒ VinculacionGoogleNoDisponibleError', async () => {
    const { uc } = makeUseCase({
      iniciador: makeIniciador({
        iniciar: vi
          .fn()
          .mockResolvedValue(
            Result.fail(new VerificacionIdentidadFallidaError('boom')),
          ),
      }),
    });

    const result = await uc.execute({
      userId: 'user-1',
      esDemo: false,
      passwordActual: 'correcta',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(
      VinculacionGoogleNoDisponibleError,
    );
  });

  it('happy path: retorna el InicioAutorizacion VERBATIM', async () => {
    const { uc } = makeUseCase({});

    const result = await uc.execute({
      userId: 'user-1',
      esDemo: false,
      passwordActual: 'correcta',
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual(INICIO_OK);
  });

  it('ningún context logueado contiene la password, el email ni un googleSub', async () => {
    const { uc, logger } = makeUseCase({});

    await uc.execute({
      userId: 'user-1',
      esDemo: false,
      passwordActual: 'super-secreta',
    });

    const serialized = JSON.stringify(logger.calls.map((c) => c.context));
    expect(serialized).not.toContain('super-secreta');
    expect(serialized).not.toContain('@');
    expect(serialized).not.toContain('sub-existente');
  });
});
