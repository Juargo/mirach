import { aPerfilHttpError } from './perfil-http-error';
import { NombrePerfilInvalidoError } from '../../../domain/errors/nombre-perfil-invalido.error';
import { EmailInvalidoError } from '../../../domain/errors/email-invalido.error';
import { PerfilDemoSoloLecturaError } from '../../../domain/errors/perfil-demo-solo-lectura.error';
import { PerfilRechazadoError } from '../../../domain/errors/perfil-rechazado.error';

describe('aPerfilHttpError — one class, exactly one status + code (PR#1 union)', () => {
  it.each([
    [new NombrePerfilInvalidoError('x'), 400, 'NOMBRE_INVALIDO'],
    [new EmailInvalidoError('x'), 400, 'EMAIL_INVALIDO'],
    [new PerfilDemoSoloLecturaError(), 403, 'DEMO_SOLO_LECTURA'],
    [new PerfilRechazadoError(), 403, 'PERFIL_RECHAZADO'],
  ] as const)('%p -> status %i, code %s', (error, status, code) => {
    const result = aPerfilHttpError(error);
    expect(result.status).toBe(status);
    expect(result.code).toBe(code);
    expect(result.message).toBe(error.message);
  });

  it('el body 403 es idéntico sin importar la causa que produjo PerfilRechazadoError (D-04)', () => {
    const fromWrongPassword = aPerfilHttpError(new PerfilRechazadoError());
    const fromEmailTaken = aPerfilHttpError(new PerfilRechazadoError());
    expect(fromWrongPassword).toEqual(fromEmailTaken);
  });
});
