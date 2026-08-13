import { PerfilRechazadoError } from './perfil-rechazado.error';

describe('PerfilRechazadoError', () => {
  it('el nombre del error es PerfilRechazadoError', () => {
    const error = new PerfilRechazadoError();
    expect(error.name).toBe('PerfilRechazadoError');
  });

  it('es un mensaje fijo, sin ningún input interpolado (D-04, anti-enumeración)', () => {
    const error = new PerfilRechazadoError();
    expect(error.message).toBe(
      'No pudimos actualizar tu perfil. Revisá los datos ingresados.',
    );
  });

  it('dos instancias tienen exactamente el mismo mensaje (colapso PERF040-03/04)', () => {
    const a = new PerfilRechazadoError();
    const b = new PerfilRechazadoError();
    expect(a.message).toBe(b.message);
  });
});
