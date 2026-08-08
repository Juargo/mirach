import { Result } from '../../shared/result';
import { VerificacionIdentidadFallidaError } from '../../domain/errors/verificacion-identidad-fallida.error';
import {
  IIniciadorLoginExterno,
  IVerificadorIdentidadExterna,
  InicioAutorizacion,
  IdentidadExterna,
  ParametrosCallback,
} from './verificador-identidad-externa.port';

/**
 * Contract test — no runtime logic to exercise here (both are pure
 * interfaces), so this pins the SHAPE via a minimal double for each role and
 * confirms both return `Result<T, VerificacionIdentidadFallidaError>`
 * (design §4.1). ISP: a double implementing `IIniciadorLoginExterno` never
 * needs to implement `verificar`, and vice versa.
 */
function makeIniciador(
  resultado: Result<InicioAutorizacion, VerificacionIdentidadFallidaError>,
): IIniciadorLoginExterno {
  return {
    iniciar: vi.fn().mockResolvedValue(resultado),
  };
}

function makeVerificador(
  resultado: Result<IdentidadExterna, VerificacionIdentidadFallidaError>,
): IVerificadorIdentidadExterna {
  return {
    verificar: vi.fn().mockResolvedValue(resultado),
  };
}

describe('verificador-identidad-externa.port', () => {
  it('IIniciadorLoginExterno.iniciar() resuelve un Result<InicioAutorizacion, ...> exitoso', async () => {
    const inicio: InicioAutorizacion = {
      urlAutorizacion: 'https://accounts.google.com/o/oauth2/v2/auth?…',
      state: 'state-abc',
      nonce: 'nonce-abc',
      codeVerifier: 'verifier-abc',
    };
    const iniciador = makeIniciador(Result.ok(inicio));

    const result = await iniciador.iniciar();

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual(inicio);
  });

  it('IIniciadorLoginExterno.iniciar() puede fallar con VerificacionIdentidadFallidaError', async () => {
    const iniciador = makeIniciador(
      Result.fail(new VerificacionIdentidadFallidaError('discovery-fallo')),
    );

    const result = await iniciador.iniciar();

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(VerificacionIdentidadFallidaError);
  });

  it('IVerificadorIdentidadExterna.verificar() resuelve un Result<IdentidadExterna, ...> exitoso', async () => {
    const identidad: IdentidadExterna = {
      sub: 'google-sub-123',
      email: 'jorge@example.com',
      emailVerificado: true,
    };
    const verificador = makeVerificador(Result.ok(identidad));
    const parametros: ParametrosCallback = {
      urlCallback:
        'https://app.moneydiary.cl/api/auth/google/callback?code=x&state=y',
      state: 'state-abc',
      nonce: 'nonce-abc',
      codeVerifier: 'verifier-abc',
    };

    const result = await verificador.verificar(parametros);

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual(identidad);
  });

  it('IVerificadorIdentidadExterna.verificar() puede fallar con VerificacionIdentidadFallidaError', async () => {
    const verificador = makeVerificador(
      Result.fail(new VerificacionIdentidadFallidaError('id-token-invalido')),
    );

    const result = await verificador.verificar({
      urlCallback:
        'https://app.moneydiary.cl/api/auth/google/callback?code=x&state=y',
      state: 'state-abc',
      nonce: 'nonce-abc',
      codeVerifier: 'verifier-abc',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(VerificacionIdentidadFallidaError);
  });
});
