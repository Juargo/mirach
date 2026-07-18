import { ObtenerIdentidadUseCase } from './obtener-identidad.use-case';
import {
  IUserCredentialRepository,
  IdentidadUsuario,
} from '../ports/user-credential-repository.port';
import { SesionInvalidaError } from '../../domain/errors/sesion-invalida.error';

// ──────────────────────────────────────────────────────────────────────────────
// Unit tests — ObtenerIdentidadUseCase (mocked port). No infra, no DB.
// ──────────────────────────────────────────────────────────────────────────────

function makeMockCreds(
  identidad: IdentidadUsuario | null,
): IUserCredentialRepository {
  return {
    buscarPorEmail: vi.fn(),
    buscarIdentidad: vi.fn().mockResolvedValue(identidad),
  };
}

describe('ObtenerIdentidadUseCase', () => {
  it('found → Result.ok({ userId, email })', async () => {
    const identidad: IdentidadUsuario = {
      userId: 'user-1',
      email: 'jorge@example.com',
    };
    const creds = makeMockCreds(identidad);
    const uc = new ObtenerIdentidadUseCase(creds);

    const result = await uc.execute({ userId: 'user-1' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual(identidad);
    expect(creds.buscarIdentidad).toHaveBeenCalledWith('user-1');
  });

  it('buscarIdentidad returns null → Result.fail(SesionInvalidaError)', async () => {
    const creds = makeMockCreds(null);
    const uc = new ObtenerIdentidadUseCase(creds);

    const result = await uc.execute({ userId: 'ghost-user' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(SesionInvalidaError);
  });
});
