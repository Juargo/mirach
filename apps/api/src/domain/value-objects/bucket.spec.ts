import { Bucket } from './bucket';

describe('Bucket', () => {
  it('expone exactamente los 4 valores canónicos de presupuesto', () => {
    expect(Bucket.Necesidades).toBe('Necesidades');
    expect(Bucket.Deseos).toBe('Deseos');
    expect(Bucket.Ahorro).toBe('Ahorro');
    expect(Bucket.Ingreso).toBe('Ingreso');
  });

  it('no tiene valores adicionales fuera del conjunto canónico (issue #778 tramo 5b: SinCategoria fue removido)', () => {
    const valores = Object.values(Bucket);
    expect(valores).toHaveLength(4);
    expect(valores).toEqual(
      expect.arrayContaining(['Necesidades', 'Deseos', 'Ahorro', 'Ingreso']),
    );
    expect(valores).not.toContain('SinCategoria');
  });
});
