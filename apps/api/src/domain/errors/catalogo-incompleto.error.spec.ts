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

  it('el mensaje nombra la categoría faltante', () => {
    const error = new CatalogoIncompletoError(Bucket.Deseos);

    expect(error.message).toContain('Desconocido');
  });

  // El assert anterior acá era `message.length > 0` bajo un título que
  // prometía "y es accionable". Ninguna de las dos cosas medía nada: la
  // longitud es vacua, y lo accionable no se testeaba — que era JUSTO el
  // defecto. La primera versión del copy decía "restaura o crea esa
  // categoría" y pasó este test con el título intacto, hasta que en
  // producción (2026-09-24) quedó claro que las dos salidas son callejones
  // sin salida. Estos dos asserts pinean las cláusulas que lo arreglan.
  it('el mensaje aclara que NO se puede resolver desde la app', () => {
    const error = new CatalogoIncompletoError(Bucket.Deseos);

    expect(error.message).toMatch(
      /no se puede crear ni restaurar desde la app/i,
    );
  });

  it('el mensaje descarta al archivo como culpable y aclara que no se importó nada', () => {
    const error = new CatalogoIncompletoError(Bucket.Deseos);

    expect(error.message).toMatch(/tu archivo está bien/i);
    expect(error.message).toMatch(/no se importó nada/i);
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
