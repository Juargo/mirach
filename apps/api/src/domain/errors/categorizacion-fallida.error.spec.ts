import { CategorizacionFallidaError } from './categorizacion-fallida.error';

describe('CategorizacionFallidaError', () => {
  it('expone el motivo en el mensaje y fija el nombre del error', () => {
    const error = new CategorizacionFallidaError('no se pudo cargar el catálogo');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('CategorizacionFallidaError');
    expect(error.motivo).toBe('no se pudo cargar el catálogo');
    expect(error.message).toContain('no se pudo cargar el catálogo');
    expect(error.causa).toBeUndefined();
  });

  it('conserva la causa original cuando se provee', () => {
    const causa = new Error('connection refused');
    const error = new CategorizacionFallidaError('fallo la carga del catálogo', causa);

    expect(error.motivo).toBe('fallo la carga del catálogo');
    expect(error.causa).toBe(causa);
    expect(error.message).toContain('fallo la carga del catálogo');
  });
});
