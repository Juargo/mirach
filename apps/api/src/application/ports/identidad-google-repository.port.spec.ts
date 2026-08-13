import { Email } from '../../domain/value-objects/email';
import { UsuarioVinculable } from './identidad-google-repository.port';
import { makeMockIdentidadGoogleRepository } from '../../../test/support/identidad-google-repository.double';

describe('identidad-google-repository.port', () => {
  it('buscarPorGoogleSub resuelve un UsuarioVinculable o null', async () => {
    const usuario: UsuarioVinculable = {
      userId: 'user-1',
      esDemo: false,
      googleSub: 'sub-abc',
    };
    const repo = makeMockIdentidadGoogleRepository({ porGoogleSub: usuario });

    const result = await repo.buscarPorGoogleSub('sub-abc');

    expect(result).toEqual(usuario);
  });

  it('buscarPorEmail recibe un Email VO y resuelve un UsuarioVinculable o null', async () => {
    const repo = makeMockIdentidadGoogleRepository({ porEmail: null });
    const email = Email.crear('jorge@example.com').getValue();

    const result = await repo.buscarPorEmail(email);

    expect(repo.buscarPorEmail).toHaveBeenCalledWith(email);
    expect(result).toBeNull();
  });

  it('vincularGoogleSub resuelve un boolean (true si aplicó, false si perdió la carrera)', async () => {
    const repoGana = makeMockIdentidadGoogleRepository({ vincular: true });
    const repoPierde = makeMockIdentidadGoogleRepository({ vincular: false });

    await expect(repoGana.vincularGoogleSub('user-1', 'sub-abc')).resolves.toBe(
      true,
    );
    await expect(
      repoPierde.vincularGoogleSub('user-1', 'sub-abc'),
    ).resolves.toBe(false);
  });

  it('buscarPorId (VINC041-03/04) resuelve un UsuarioVinculable o null — proyección por PK', async () => {
    const usuario: UsuarioVinculable = {
      userId: 'user-1',
      esDemo: false,
      googleSub: null,
    };
    const repo = makeMockIdentidadGoogleRepository({ porId: usuario });

    const result = await repo.buscarPorId('user-1');

    expect(result).toEqual(usuario);
  });

  it('buscarPorId resuelve null cuando el usuario no existe', async () => {
    const repo = makeMockIdentidadGoogleRepository({ porId: null });

    await expect(repo.buscarPorId('nadie')).resolves.toBeNull();
  });
});
