import { elegirBaseIngreso } from './base-ingreso';

// Issue #111, rule 1 (VIS-10): percentages use the declared monthly income;
// without it, the sum of credits classified as income.
describe('elegirBaseIngreso', () => {
  it('uses the declared income when there is one, keeping the detected sum', () => {
    expect(elegirBaseIngreso(2_000_000n, 1_000_000n)).toEqual({
      monto: 2_000_000n,
      fuente: 'declarado',
      detectado: 1_000_000n,
    });
  });

  it('uses the declared income even when no income was detected', () => {
    expect(elegirBaseIngreso(2_000_000n, 0n)).toEqual({
      monto: 2_000_000n,
      fuente: 'declarado',
      detectado: 0n,
    });
  });

  it('falls back to the detected sum without a declared income', () => {
    expect(elegirBaseIngreso(null, 1_000_000n)).toEqual({
      monto: 1_000_000n,
      fuente: 'detectado',
      detectado: 1_000_000n,
    });
  });

  it('is 0 without a declared income and without detected income', () => {
    expect(elegirBaseIngreso(null, 0n)).toEqual({
      monto: 0n,
      fuente: 'detectado',
      detectado: 0n,
    });
  });
});
