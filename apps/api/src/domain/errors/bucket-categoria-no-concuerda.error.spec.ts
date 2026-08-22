import { describe, it, expect } from 'vitest';
import { BucketCategoriaNoConcuerdaError } from './bucket-categoria-no-concuerda.error';
import { Bucket } from '../value-objects/bucket';

describe('BucketCategoriaNoConcuerdaError', () => {
  it('construye con un mensaje fijo y propiedades de diagnóstico', () => {
    const error = new BucketCategoriaNoConcuerdaError('cat_abc', Bucket.Deseos);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(BucketCategoriaNoConcuerdaError);
    expect(error.name).toBe('BucketCategoriaNoConcuerdaError');
    expect(error.categoriaId).toBe('cat_abc');
    expect(error.bucket).toBe(Bucket.Deseos);
  });

  it('el mensaje es una constante fija: no interpola el categoriaId ni el bucket', () => {
    const error = new BucketCategoriaNoConcuerdaError(
      'cat_ajeno',
      Bucket.Necesidades,
    );

    // El mensaje nunca expone datos del request (ADR-013, scrub-safe)
    expect(error.message).not.toContain('cat_ajeno');
    expect(error.message).not.toContain('Necesidades');
    expect(error.message).not.toContain('amount');
    expect(error.message).not.toContain('12345');
  });

  it('el mensaje es idéntico para cualquier combinación (constante de compilación)', () => {
    const a = new BucketCategoriaNoConcuerdaError('cat_x', Bucket.Deseos);
    const b = new BucketCategoriaNoConcuerdaError('cat_y', Bucket.Ahorro);

    expect(a.message).toBe(b.message);
  });

  it('expone categoriaId como propiedad para logging (nunca en .message)', () => {
    const error = new BucketCategoriaNoConcuerdaError('cat_log', Bucket.Deseos);

    expect(error.categoriaId).toBe('cat_log');
    expect(error.message).not.toContain('cat_log');
  });

  it('expone bucket como propiedad para logging (nunca en .message)', () => {
    const error = new BucketCategoriaNoConcuerdaError('cat_abc', Bucket.Ahorro);

    expect(error.bucket).toBe(Bucket.Ahorro);
    expect(error.message).not.toContain('Ahorro');
  });

  it('es instancia de Error (hereda correctamente)', () => {
    const error = new BucketCategoriaNoConcuerdaError('cat_abc', Bucket.Deseos);

    expect(error instanceof Error).toBe(true);
  });
});
