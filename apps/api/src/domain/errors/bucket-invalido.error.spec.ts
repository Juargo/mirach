import { BucketInvalidoError } from './bucket-invalido.error';

describe('BucketInvalidoError', () => {
  it('el mensaje NUNCA contiene el valor crudo recibido', () => {
    const error = new BucketInvalidoError('nope-invalido');
    expect(error.message).not.toContain('nope-invalido');
  });

  it('el mensaje describe el formato esperado', () => {
    const error = new BucketInvalidoError('nope-invalido');
    expect(error.message).toContain('bucket');
  });

  it('rawValue conserva el valor original para logging server-side', () => {
    const error = new BucketInvalidoError('nope-invalido');
    expect(error.rawValue).toBe('nope-invalido');
  });

  it('el nombre del error es BucketInvalidoError', () => {
    const error = new BucketInvalidoError('nope-invalido');
    expect(error.name).toBe('BucketInvalidoError');
  });
});
