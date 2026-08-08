import { Email } from '../../domain/value-objects/email';
import {
  IIdentidadGoogleRepository,
  UsuarioVinculable,
} from './identidad-google-repository.port';

/**
 * Double reutilizado por `login-con-google.use-case.spec.ts` (A7). Pin del
 * shape (design §5.2): tres métodos, un rol (ISP) — sin filtrar demo en el
 * repo (eso es responsabilidad del use case).
 */
function makeMockIdentidadGoogleRepository(overrides?: {
  porGoogleSub?: UsuarioVinculable | null;
  porEmail?: UsuarioVinculable | null;
  vincular?: boolean;
}): IIdentidadGoogleRepository {
  return {
    buscarPorGoogleSub: vi
      .fn()
      .mockResolvedValue(overrides?.porGoogleSub ?? null),
    buscarPorEmail: vi.fn().mockResolvedValue(overrides?.porEmail ?? null),
    vincularGoogleSub: vi.fn().mockResolvedValue(overrides?.vincular ?? true),
  };
}

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
});
