import { PatronInvalidoError } from './patron-invalido.error';

describe('PatronInvalidoError', () => {
  it('el nombre del error es PatronInvalidoError', () => {
    const error = new PatronInvalidoError('');
    expect(error.name).toBe('PatronInvalidoError');
  });

  it('el mensaje describe el formato esperado (1–200 caracteres)', () => {
    const error = new PatronInvalidoError('');
    expect(error.message).toMatch(/1.*200/);
  });

  it('conserva el valor original solo para logging server-side', () => {
    const error = new PatronInvalidoError('x'.repeat(201));
    expect(error.rawValue).toBe('x'.repeat(201));
  });
});
