import { PersistenciaFallidaError } from './persistencia-fallida.error';

describe('PersistenciaFallidaError', () => {
  it('expone el motivo en el mensaje y fija el nombre del error', () => {
    const error = new PersistenciaFallidaError('no se pudo escribir la ingesta');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('PersistenciaFallidaError');
    expect(error.motivo).toBe('no se pudo escribir la ingesta');
    expect(error.message).toContain('no se pudo escribir la ingesta');
    expect(error.causa).toBeUndefined();
  });

  it('conserva la causa original cuando se provee', () => {
    const causa = new Error('connection refused');
    const error = new PersistenciaFallidaError('fallo la transacción atómica', causa);

    expect(error.motivo).toBe('fallo la transacción atómica');
    expect(error.causa).toBe(causa);
    expect(error.message).toContain('fallo la transacción atómica');
  });
});
