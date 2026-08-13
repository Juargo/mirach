import { VinculoRequierePasswordError } from './vinculo-requiere-password.error';

describe('VinculoRequierePasswordError', () => {
  it('el nombre del error es VinculoRequierePasswordError', () => {
    const error = new VinculoRequierePasswordError();
    expect(error.name).toBe('VinculoRequierePasswordError');
  });

  it('es un mensaje fijo, sin ningún input interpolado', () => {
    const a = new VinculoRequierePasswordError();
    const b = new VinculoRequierePasswordError();
    expect(a.message).toBe(b.message);
    expect(a.message).toBe(
      'configurá una contraseña antes de desvincular Google',
    );
  });
});
