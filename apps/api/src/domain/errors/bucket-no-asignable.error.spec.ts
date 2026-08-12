import { BucketNoAsignableError } from './bucket-no-asignable.error';

describe('BucketNoAsignableError', () => {
  it('el nombre del error es BucketNoAsignableError', () => {
    const error = new BucketNoAsignableError('Ingreso');
    expect(error.name).toBe('BucketNoAsignableError');
  });

  it('el mensaje enumera los buckets asignables (taxonomía fija, no dato de usuario)', () => {
    const error = new BucketNoAsignableError(undefined);
    expect(error.message).toContain('Necesidades');
    expect(error.message).toContain('Deseos');
    expect(error.message).toContain('Ahorro');
  });

  it('cubre bucket faltante, desconocido, Ingreso y SinCategoria con la misma clase', () => {
    expect(new BucketNoAsignableError(undefined).rawValue).toBeUndefined();
    expect(new BucketNoAsignableError('nope').rawValue).toBe('nope');
    expect(new BucketNoAsignableError('Ingreso').rawValue).toBe('Ingreso');
    expect(new BucketNoAsignableError('SinCategoria').rawValue).toBe(
      'SinCategoria',
    );
  });
});
