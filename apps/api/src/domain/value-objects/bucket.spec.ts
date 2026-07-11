import { Bucket } from './bucket';

describe('Bucket', () => {
  it('expone exactamente los 5 valores canónicos de presupuesto', () => {
    expect(Bucket.Necesidades).toBe('Necesidades');
    expect(Bucket.Deseos).toBe('Deseos');
    expect(Bucket.Ahorro).toBe('Ahorro');
    expect(Bucket.Ingreso).toBe('Ingreso');
    expect(Bucket.SinCategoria).toBe('SinCategoria');
  });

  it('no tiene valores adicionales fuera del conjunto canónico', () => {
    const valores = Object.values(Bucket);
    expect(valores).toHaveLength(5);
    expect(valores).toEqual(
      expect.arrayContaining([
        'Necesidades',
        'Deseos',
        'Ahorro',
        'Ingreso',
        'SinCategoria',
      ]),
    );
  });
});
