import { RegexInvalidaError } from './regex-invalida.error';

describe('RegexInvalidaError', () => {
  it('el nombre del error es RegexInvalidaError', () => {
    const error = new RegexInvalidaError('(');
    expect(error.name).toBe('RegexInvalidaError');
  });

  it('el mensaje NUNCA contiene la expresión regular cruda', () => {
    const error = new RegexInvalidaError('(');
    expect(error.message).not.toContain('(');
  });

  it('conserva el patrón original solo para logging server-side', () => {
    const error = new RegexInvalidaError('(');
    expect(error.rawValue).toBe('(');
  });
});
