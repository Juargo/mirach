import { DesvincularGoogleUseCase } from './desvincular-google.use-case';
import { IUserCredentialRepository } from '../ports/user-credential-repository.port';
import { IIdentidadGoogleRepository } from '../ports/identidad-google-repository.port';
import { IPasswordHasher } from '../ports/password-hasher.port';
import { PerfilDemoSoloLecturaError } from '../../domain/errors/perfil-demo-solo-lectura.error';
import { VinculoRequierePasswordError } from '../../domain/errors/vinculo-requiere-password.error';
import { PerfilRechazadoError } from '../../domain/errors/perfil-rechazado.error';
import { NoOpLogger } from '../../../test/support/logger.double';

const CREDENCIAL_OK = { userId: 'user-1', passwordHash: 'hash-1' };

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
    buscarPorId: vi.fn(),
    desvincularGoogleSub: vi.fn().mockResolvedValue(true),
    crearDesdeGoogle: vi.fn(),
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
  hasher?: IPasswordHasher;
}): DesvincularGoogleUseCase {
  return new DesvincularGoogleUseCase(
    deps.creds ?? makeCreds(),
    deps.identidades ?? makeIdentidades(),
    deps.hasher ?? makeHasher(),
    new NoOpLogger(),
  );
}

describe('DesvincularGoogleUseCase (VINC041-05, design §4.3/§5.2)', () => {
  it('demo ⇒ PerfilDemoSoloLecturaError, sin tocar credenciales ni el write', async () => {
    const creds = makeCreds();
    const identidades = makeIdentidades();
    const useCase = makeUseCase({ creds, identidades });

    const resultado = await useCase.execute({
      userId: 'user-1',
      esDemo: true,
      passwordActual: 'irrelevante',
    });

    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError()).toBeInstanceOf(PerfilDemoSoloLecturaError);
    expect(creds.buscarCredencialPorId).not.toHaveBeenCalled();
    expect(identidades.desvincularGoogleSub).not.toHaveBeenCalled();
  });

  it('binding proof (b): credencial null (sin passwordHash) ⇒ VinculoRequierePasswordError, el write NUNCA se llama', async () => {
    const creds = makeCreds({
      buscarCredencialPorId: vi.fn().mockResolvedValue(null),
    });
    const identidades = makeIdentidades();
    const useCase = makeUseCase({ creds, identidades });

    const resultado = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      passwordActual: 'lo-que-sea',
    });

    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError()).toBeInstanceOf(VinculoRequierePasswordError);
    expect(identidades.desvincularGoogleSub).not.toHaveBeenCalled();
  });

  it('password incorrecta ⇒ PerfilRechazadoError, el write NUNCA se llama', async () => {
    const identidades = makeIdentidades();
    const useCase = makeUseCase({
      hasher: makeHasher(false),
      identidades,
    });

    const resultado = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      passwordActual: 'incorrecta',
    });

    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError()).toBeInstanceOf(PerfilRechazadoError);
    expect(identidades.desvincularGoogleSub).not.toHaveBeenCalled();
  });

  it('write true ⇒ ok', async () => {
    const identidades = makeIdentidades({
      desvincularGoogleSub: vi.fn().mockResolvedValue(true),
    });
    const useCase = makeUseCase({ identidades });

    const resultado = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      passwordActual: 'correcta',
    });

    expect(resultado.isOk()).toBe(true);
    expect(identidades.desvincularGoogleSub).toHaveBeenCalledWith('user-1');
  });

  it('write false ⇒ ok (idempotente — el estado final pedido ya se sostenía)', async () => {
    const identidades = makeIdentidades({
      desvincularGoogleSub: vi.fn().mockResolvedValue(false),
    });
    const useCase = makeUseCase({ identidades });

    const resultado = await useCase.execute({
      userId: 'user-1',
      esDemo: false,
      passwordActual: 'correcta',
    });

    expect(resultado.isOk()).toBe(true);
  });
});
