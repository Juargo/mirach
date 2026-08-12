import { PrioridadInvalidaError } from './prioridad-invalida.error';

describe('PrioridadInvalidaError', () => {
  it('el nombre del error es PrioridadInvalidaError', () => {
    const error = new PrioridadInvalidaError(1000);
    expect(error.name).toBe('PrioridadInvalidaError');
  });

  it('el mensaje describe el rango esperado (1–999)', () => {
    const error = new PrioridadInvalidaError(1000);
    expect(error.message).toMatch(/1.*999/);
  });

  it('conserva el valor original solo para logging server-side', () => {
    const error = new PrioridadInvalidaError(1000);
    expect(error.rawValue).toBe(1000);
  });
});
