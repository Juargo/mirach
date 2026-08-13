import { NombrePerfilInvalidoError } from './nombre-perfil-invalido.error';

describe('NombrePerfilInvalidoError', () => {
  it('el nombre del error es NombrePerfilInvalidoError', () => {
    const error = new NombrePerfilInvalidoError();
    expect(error.name).toBe('NombrePerfilInvalidoError');
  });

  it('el mensaje describe el formato esperado (1–80 caracteres)', () => {
    const error = new NombrePerfilInvalidoError();
    expect(error.message).toMatch(/1.*80/);
  });

  it('NO tiene una propiedad rawValue — nada la loguea (D-07); un campo "solo para logging" que nada loguea era dead code', () => {
    const error = new NombrePerfilInvalidoError();
    expect(
      (error as unknown as { rawValue?: unknown }).rawValue,
    ).toBeUndefined();
  });
});
