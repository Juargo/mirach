import {
  IIdentidadGoogleRepository,
  UsuarioVinculable,
} from '../../src/application/ports/identidad-google-repository.port';

/**
 * Double compartido por `login-con-google.use-case.spec.ts` e
 * `identidad-google-repository.port.spec.ts` (dedupe post-review, A7).
 * Pin del shape (design §5.2): tres métodos, un rol (ISP) — sin filtrar
 * demo en el repo (eso es responsabilidad del use case).
 */
export function makeMockIdentidadGoogleRepository(overrides?: {
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
