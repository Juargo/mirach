import { MatchTypeInvalidoError } from './match-type-invalido.error';

describe('MatchTypeInvalidoError', () => {
  it('el nombre del error es MatchTypeInvalidoError', () => {
    const error = new MatchTypeInvalidoError('FUZZY');
    expect(error.name).toBe('MatchTypeInvalidoError');
  });

  it('el mensaje enumera los tipos válidos', () => {
    const error = new MatchTypeInvalidoError('FUZZY');
    expect(error.message).toContain('CONTAINS');
    expect(error.message).toContain('STARTS_WITH');
    expect(error.message).toContain('REGEX');
  });

  it('conserva el valor original solo para logging server-side', () => {
    const error = new MatchTypeInvalidoError('FUZZY');
    expect(error.rawValue).toBe('FUZZY');
  });
});
