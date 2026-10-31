import {
  ObtenerConfiguracionAppUseCase,
  type ConfiguracionApp,
} from './obtener-configuracion-app.use-case';
import { VersionApp } from '../../domain/value-objects/version-app';

function v(raw: string): VersionApp {
  return VersionApp.crear(raw).getValue();
}

const CONFIG: ConfiguracionApp = {
  versionMinima: { ios: v('1.10.0'), android: v('2.0.0') },
  planGratis: { bancosMaximos: 2, soloMesActual: true },
  flagsActivos: ['nuevoResumen', 'importarPdf'],
};

describe('ObtenerConfiguracionAppUseCase (ADR-005 §4.5)', () => {
  const useCase = new ObtenerConfiguracionAppUseCase(CONFIG);

  it('devuelve las versiones mínimas, el plan gratis y los flags activos', () => {
    const config = useCase.execute({});

    expect(config.versionMinima).toEqual({ ios: '1.10.0', android: '2.0.0' });
    expect(config.planGratis).toEqual({
      bancosMaximos: 2,
      soloMesActual: true,
    });
    expect(config.flags).toEqual({ nuevoResumen: true, importarPdf: true });
  });

  it('actualizacionRequerida=true cuando la instalada es menor que la mínima de SU plataforma', () => {
    expect(
      useCase.execute({ plataforma: 'ios', version: '1.9.9' })
        .actualizacionRequerida,
    ).toBe(true);
    // 1.10.0 is the iOS minimum but below Android's 2.0.0.
    expect(
      useCase.execute({ plataforma: 'android', version: '1.10.0' })
        .actualizacionRequerida,
    ).toBe(true);
  });

  it('actualizacionRequerida=false cuando la instalada es igual o mayor', () => {
    expect(
      useCase.execute({ plataforma: 'ios', version: '1.10.0' })
        .actualizacionRequerida,
    ).toBe(false);
    expect(
      useCase.execute({ plataforma: 'IOS', version: '1.11.0' })
        .actualizacionRequerida,
    ).toBe(false);
  });

  it.each([
    [{}],
    [{ plataforma: 'ios' }],
    [{ version: '1.0.0' }],
    [{ plataforma: 'web', version: '1.0.0' }],
    [{ plataforma: 'ios', version: 'latest' }],
  ])('actualizacionRequerida=null sin cabeceras válidas: %j', (cliente) => {
    expect(useCase.execute(cliente).actualizacionRequerida).toBeNull();
  });

  it('sin flags activos devuelve un objeto vacío', () => {
    const sinFlags = new ObtenerConfiguracionAppUseCase({
      ...CONFIG,
      flagsActivos: [],
    });

    expect(sinFlags.execute({}).flags).toEqual({});
  });
});
