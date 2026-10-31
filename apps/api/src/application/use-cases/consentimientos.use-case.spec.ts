import { TipoConsentimiento } from '../../domain/value-objects/consentimiento';
import { ConsentimientoCartolasRequeridoError } from '../../domain/errors/consentimiento-cartolas-requerido.error';
import { VersionConsentimientoInvalidaError } from '../../domain/errors/version-consentimiento-invalida.error';
import type { IConsentimientoRepository } from '../ports/consentimiento-repository.port';
import {
  AceptarConsentimientoUseCase,
  VerificarConsentimientoCartolasUseCase,
} from './consentimientos.use-case';

function makeRepositorio(vigente = false) {
  return {
    tieneVigente: vi.fn().mockResolvedValue(vigente),
    listar: vi.fn(),
    aceptar: vi.fn(),
    revocar: vi.fn(),
  } satisfies IConsentimientoRepository;
}

describe('VerificarConsentimientoCartolasUseCase', () => {
  it('sin exigir no consulta nada y deja pasar', async () => {
    const repositorio = makeRepositorio();
    const uc = new VerificarConsentimientoCartolasUseCase(repositorio, false);

    const result = await uc.execute({ userId: 'user-1' });

    expect(result.isOk()).toBe(true);
    expect(repositorio.tieneVigente).not.toHaveBeenCalled();
  });

  it('exigido y sin consentimiento vigente: falla', async () => {
    const repositorio = makeRepositorio(false);
    const uc = new VerificarConsentimientoCartolasUseCase(repositorio, true);

    const result = await uc.execute({ userId: 'user-1' });

    expect(result.getError()).toBeInstanceOf(
      ConsentimientoCartolasRequeridoError,
    );
    expect(repositorio.tieneVigente).toHaveBeenCalledWith(
      'user-1',
      TipoConsentimiento.Cartolas,
    );
  });

  it('exigido y con consentimiento vigente: deja pasar', async () => {
    const uc = new VerificarConsentimientoCartolasUseCase(
      makeRepositorio(true),
      true,
    );

    expect((await uc.execute({ userId: 'user-1' })).isOk()).toBe(true);
  });
});

describe('AceptarConsentimientoUseCase', () => {
  it('una versión malformada no llega al repositorio', async () => {
    const repositorio = makeRepositorio();
    const uc = new AceptarConsentimientoUseCase(repositorio);

    const result = await uc.execute({
      userId: 'user-1',
      tipo: TipoConsentimiento.Cartolas,
      version: 'con espacio',
    });

    expect(result.getError()).toBeInstanceOf(
      VersionConsentimientoInvalidaError,
    );
    expect(repositorio.aceptar).not.toHaveBeenCalled();
  });
});
