import { aPerfilHttpError } from './perfil-http-error';
import { NombrePerfilInvalidoError } from '../../../domain/errors/nombre-perfil-invalido.error';
import { EmailInvalidoError } from '../../../domain/errors/email-invalido.error';
import { PerfilDemoSoloLecturaError } from '../../../domain/errors/perfil-demo-solo-lectura.error';
import { PerfilRechazadoError } from '../../../domain/errors/perfil-rechazado.error';
import { PasswordInvalidaError } from '../../../domain/errors/password-invalida.error';
import { GoogleYaVinculadoError } from '../../../domain/errors/google-ya-vinculado.error';
import { VinculacionGoogleNoDisponibleError } from '../../../domain/errors/vinculacion-google-no-disponible.error';
import { VinculoRequierePasswordError } from '../../../domain/errors/vinculo-requiere-password.error';

describe('aPerfilHttpError — one class, exactly one status + code (union ampliada PR#2/PR#3)', () => {
  it.each([
    [new NombrePerfilInvalidoError(), 400, 'NOMBRE_INVALIDO'],
    [new EmailInvalidoError('x'), 400, 'EMAIL_INVALIDO'],
    [new PerfilDemoSoloLecturaError(), 403, 'DEMO_SOLO_LECTURA'],
    [new PerfilRechazadoError(), 403, 'PERFIL_RECHAZADO'],
    [new PasswordInvalidaError(), 400, 'PASSWORD_INVALIDA'],
    [new GoogleYaVinculadoError(), 409, 'GOOGLE_YA_VINCULADO'],
    [new VinculacionGoogleNoDisponibleError(), 503, 'GOOGLE_NO_DISPONIBLE'],
    [new VinculoRequierePasswordError(), 403, 'VINCULO_REQUIERE_PASSWORD'],
  ] as const)('%p -> status %i, code %s', (error, status, code) => {
    const result = aPerfilHttpError(error);
    expect(result.status).toBe(status);
    expect(result.code).toBe(code);
    expect(result.message).toBe(error.message);
  });

  it('el body 403 es idéntico sin importar la causa que produjo PerfilRechazadoError (D-04) — incluye el nuevo caller (IniciarVinculacionGoogleUseCase)', () => {
    const fromWrongPassword = aPerfilHttpError(new PerfilRechazadoError());
    const fromEmailTaken = aPerfilHttpError(new PerfilRechazadoError());
    expect(fromWrongPassword).toEqual(fromEmailTaken);
  });
});
