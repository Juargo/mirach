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
      expect(Number.isInteger(parsearMontoPdf(valor))).toBe(true);
    },
  );

  it('texto vacío → 0 (celda sin monto, CA-06)', () => {
    expect(parsearMontoPdf('')).toBe(0);
  });

  it('texto solo espacios → 0', () => {
    expect(parsearMontoPdf('   ')).toBe(0);
  });

  it('signo negativo se descarta → valor absoluto (misma convención CA-08 que el normalizador Excel)', () => {
    expect(parsearMontoPdf('-135.010')).toBe(135010);
  });

  it('prefijo "$" con espacio interno se descarta', () => {
    expect(parsearMontoPdf('$ 45.990')).toBe(45990);
  });

  it('texto ininterpretable → 0, nunca NaN', () => {
    expect(parsearMontoPdf('abc')).toBe(0);
    expect(Number.isNaN(parsearMontoPdf('abc'))).toBe(false);
  });

  it('separador de miles mal formado (grupo de 2 dígitos) → 0, nunca NaN', () => {
    expect(parsearMontoPdf('12.34')).toBe(0);
  });
});
