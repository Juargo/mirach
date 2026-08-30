import {
  IIdentidadGoogleRepository,
  UsuarioVinculable,
} from '../../src/application/ports/identidad-google-repository.port';

/**
 * Double compartido por `login-con-google.use-case.spec.ts` e
 * `identidad-google-repository.port.spec.ts` (dedupe post-review, A7).
 * Pin del shape (design §5.2): un rol (ISP) — sin filtrar
 * demo en el repo (eso es responsabilidad del use case).
 *
 * `crear` (ADR-041): el userId que retorna `crearDesdeGoogle`, o `null` para
 * simular la carrera de creación perdida (P2002). Default permisivo
 * ('user-nuevo'), mismo criterio que `vincular: true`.
 */
export function makeMockIdentidadGoogleRepository(overrides?: {
  porGoogleSub?: UsuarioVinculable | null;
  porEmail?: UsuarioVinculable | null;
  vincular?: boolean;
  porId?: UsuarioVinculable | null;
  desvincular?: boolean;
  crear?: string | null;
}): IIdentidadGoogleRepository {
  return {
    buscarPorGoogleSub: vi
      .fn()
      .mockResolvedValue(overrides?.porGoogleSub ?? null),
    buscarPorEmail: vi.fn().mockResolvedValue(overrides?.porEmail ?? null),
    vincularGoogleSub: vi.fn().mockResolvedValue(overrides?.vincular ?? true),
    buscarPorId: vi.fn().mockResolvedValue(overrides?.porId ?? null),
    desvincularGoogleSub: vi
      .fn()
      .mockResolvedValue(overrides?.desvincular ?? true),
    crearDesdeGoogle: vi
      .fn()
      .mockResolvedValue(
        overrides?.crear === undefined ? 'user-nuevo' : overrides.crear,
      ),
  };
}
