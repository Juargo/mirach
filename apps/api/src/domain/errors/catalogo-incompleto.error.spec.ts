import { Bucket } from '../value-objects/bucket';
import { CatalogoIncompletoError } from './catalogo-incompleto.error';

describe('CatalogoIncompletoError', () => {
  it('tiene name "CatalogoIncompletoError" y expone bucket como propiedad readonly', () => {
    const error = new CatalogoIncompletoError(Bucket.Deseos);

    expect(error.name).toBe('CatalogoIncompletoError');
    expect(error.bucket).toBe(Bucket.Deseos);
  });

  it('el mensaje usa la etiqueta de producto del bucket ("Gustos"), no el nombre de dominio', () => {
    const error = new CatalogoIncompletoError(Bucket.Deseos);

    expect(error.message).toContain('Gustos');
    expect(error.message).not.toContain('Deseos');
  });

  it('el mensaje nombra la categoría faltante y es accionable', () => {
    const error = new CatalogoIncompletoError(Bucket.Deseos);

    expect(error.message).toContain('Desconocido');
    expect(error.message.length).toBeGreaterThan(0);
  });

  it('el mensaje no contiene ningún dígito — guarda estructural contra una futura interpolación de montos', () => {
    const error = new CatalogoIncompletoError(Bucket.Deseos);

    expect(error.message).not.toMatch(/\d/);
  });

  it('es instancia de Error', () => {
    const error = new CatalogoIncompletoError(Bucket.Deseos);

    expect(error).toBeInstanceOf(Error);
  });
});
