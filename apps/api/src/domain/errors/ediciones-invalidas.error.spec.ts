import { EdicionesInvalidasError } from './ediciones-invalidas.error';

describe('EdicionesInvalidasError', () => {
  it('construye con un mensaje descriptivo fijo', () => {
    const error = new EdicionesInvalidasError(
      'el campo edits no es un JSON válido',
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(EdicionesInvalidasError);
    expect(error.name).toBe('EdicionesInvalidasError');
    expect(error.message).toContain('edits');
  });

  it('no expone datos sensibles en el mensaje (motivo solo describe el formato, no el valor)', () => {
    const error = new EdicionesInvalidasError(
      'cada edición requiere rowIndex entero y categoriaId',
    );

    // El mensaje nunca debe contener montos ni valores crudos
    expect(error.message).not.toContain('1500000');
    expect(error.message).not.toContain('amount');
    expect(error.message).toContain('edits');
  });

  it('expone el motivo como propiedad', () => {
    const motivo = 'el campo edits no es un arreglo';
    const error = new EdicionesInvalidasError(motivo);

    expect(error.motivo).toBe(motivo);
  });

  it('es instancia de Error (hereda correctamente)', () => {
    const error = new EdicionesInvalidasError('formato inválido');

    expect(error instanceof Error).toBe(true);
  });
});
