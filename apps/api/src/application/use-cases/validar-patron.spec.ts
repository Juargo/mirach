import { validarPatron } from './validar-patron';
import { PatronInvalidoError } from '../../domain/errors/patron-invalido.error';
import { MatchTypeInvalidoError } from '../../domain/errors/match-type-invalido.error';
import { RegexInvalidaError } from '../../domain/errors/regex-invalida.error';
import { PrioridadInvalidaError } from '../../domain/errors/prioridad-invalida.error';

/**
 * validarPatron — pure shape/format validation extracted from
 * CrearPatronUseCase (design.md D-02). No I/O: no ownership check, no
 * uniqueness check — those stay in the callers (CrearPatronUseCase's own
 * ownership 404 + CrearCategoriaUseCase's within-batch/existing-catalog
 * duplicate checks).
 */
describe('validarPatron', () => {
  it('acepta un patrón válido, con trim, y prioridad por defecto 100', () => {
    const result = validarPatron({
      patron: '  netflix  ',
      matchType: 'CONTAINS',
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual({
      patron: 'netflix',
      matchType: 'CONTAINS',
      prioridad: 100,
    });
  });

  it.each(['', '  ', 'x'.repeat(201)])(
    'rechaza un patron inválido: %j',
    (patron) => {
      const result = validarPatron({ patron, matchType: 'CONTAINS' });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PatronInvalidoError);
    },
  );

  it('rechaza un matchType inválido', () => {
    const result = validarPatron({ patron: 'netflix', matchType: 'FUZZY' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(MatchTypeInvalidoError);
  });

  it('con matchType REGEX, valida que el patrón compile (new RegExp)', () => {
    const result = validarPatron({ patron: '(', matchType: 'REGEX' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(RegexInvalidaError);
  });

  it('una REGEX válida se acepta', () => {
    const result = validarPatron({ patron: '^net.*', matchType: 'REGEX' });

    expect(result.isOk()).toBe(true);
  });

  it('prioridad fuera de rango (1000) es rechazada', () => {
    const result = validarPatron({
      patron: 'netflix',
      matchType: 'CONTAINS',
      prioridad: 1000,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PrioridadInvalidaError);
  });

  it('prioridad ausente por defecto es 100', () => {
    const result = validarPatron({ patron: 'netflix', matchType: 'CONTAINS' });

    expect(result.getValue().prioridad).toBe(100);
  });

  it('prioridad válida explícita se respeta', () => {
    const result = validarPatron({
      patron: 'netflix',
      matchType: 'CONTAINS',
      prioridad: 5,
    });

    expect(result.getValue().prioridad).toBe(5);
  });
});
