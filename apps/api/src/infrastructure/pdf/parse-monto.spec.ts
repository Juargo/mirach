import { parsearMontoPdf } from './parse-monto';

describe('parsearMontoPdf', () => {
  it.each([
    ['$135.010', 135010],
    ['1.580.000', 1580000],
    ['250.000', 250000],
    ['0', 0],
    ['850.000', 850000],
    ['45.990', 45990],
  ])(
    'parsea "%s" como el entero exacto %i (sin punto flotante)',
    (valor, esperado) => {
      expect(parsearMontoPdf(valor)).toBe(esperado);
      expect(Number.isInteger(parsearMontoPdf(valor) as number)).toBe(true);
    },
  );

  it('texto vacío → null (columna sin monto — el caller decide 0, CA-06)', () => {
    expect(parsearMontoPdf('')).toBeNull();
  });

  it('texto solo espacios → null', () => {
    expect(parsearMontoPdf('   ')).toBeNull();
  });

  it('signo negativo AL INICIO se descarta → valor absoluto (misma convención CA-08 que el normalizador Excel)', () => {
    expect(parsearMontoPdf('-135.010')).toBe(135010);
  });

  it('prefijo "$" con espacio interno se descarta', () => {
    expect(parsearMontoPdf('$ 45.990')).toBe(45990);
  });

  it('texto ininterpretable → null, NUNCA 0 y NUNCA NaN (hardening PR4b — un monto malformado no puede pasar como "sin monto")', () => {
    expect(parsearMontoPdf('abc')).toBeNull();
  });

  it('separador de miles mal formado (grupo de 2 dígitos, "12.34") → null, no 0', () => {
    expect(parsearMontoPdf('12.34')).toBeNull();
  });

  it('signo negativo AL FINAL ("15.000-") → null — NO es el mismo caso que el signo al inicio, es un formato roto', () => {
    expect(parsearMontoPdf('15.000-')).toBeNull();
  });

  it('coma decimal ("1.500,50") → null — este parser es solo CLP entero, sin decimales', () => {
    expect(parsearMontoPdf('1.500,50')).toBeNull();
  });

  it('nunca retorna NaN para ninguna entrada ininterpretable', () => {
    for (const v of ['abc', '12.34', '15.000-', '1.500,50', '', '   ']) {
      const r = parsearMontoPdf(v);
      expect(r === null || Number.isFinite(r)).toBe(true);
    }
  });
});
