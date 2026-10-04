import {
  IIdentidadAppleRepository,
  UsuarioApple,
} from '../../src/application/ports/identidad-apple-repository.port';

/**
 * Double de `IIdentidadAppleRepository`. `crear` es el userId que retorna
 * `crearDesdeApple`, o `null` para simular la carrera de creación perdida
 * (P2002); el default es permisivo, como en el double de Google.
 */
export function makeMockIdentidadAppleRepository(overrides?: {
  porAppleSub?: UsuarioApple | null;
  /** Respuestas sucesivas de `buscarPorAppleSub` (la última se repite). */
  porAppleSubSecuencia?: (UsuarioApple | null)[];
  porEmail?: UsuarioApple | null;
  vincular?: boolean;
  crear?: string | null;
}): IIdentidadAppleRepository {
  const buscarPorAppleSub = vi.fn();
  if (overrides?.porAppleSubSecuencia !== undefined) {
    const secuencia = overrides.porAppleSubSecuencia;
    let i = 0;
    buscarPorAppleSub.mockImplementation(
      async () => secuencia[Math.min(i++, secuencia.length - 1)],
    );
  } else {
    buscarPorAppleSub.mockResolvedValue(overrides?.porAppleSub ?? null);
  }

  return {
    buscarPorAppleSub,
    buscarPorEmail: vi.fn().mockResolvedValue(overrides?.porEmail ?? null),
    vincularAppleSub: vi.fn().mockResolvedValue(overrides?.vincular ?? true),
    crearDesdeApple: vi
      .fn()
      .mockResolvedValue(
        overrides?.crear === undefined ? 'user-nuevo' : overrides.crear,
      ),
  };
}
