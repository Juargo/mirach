import { PatronNoEncontradoError } from './patron-no-encontrado.error';

describe('PatronNoEncontradoError', () => {
  it('el nombre del error es PatronNoEncontradoError', () => {
    const error = new PatronNoEncontradoError('patron-1');
    expect(error.name).toBe('PatronNoEncontradoError');
  });

  it('el mensaje fusiona "no existe" y "no es tuyo" (anti-enumeration)', () => {
    const error = new PatronNoEncontradoError('patron-1');
    expect(error.message).toBe(
      'El patrón no existe o no pertenece al usuario autenticado.',
    );
  });

  it('conserva el id original solo para logging server-side', () => {
    const error = new PatronNoEncontradoError('patron-1');
    expect(error.patronId).toBe('patron-1');
  });
});
