import { SinMovimientosError } from './sin-movimientos.error';

describe('SinMovimientosError', () => {
  it('tiene name "SinMovimientosError" y expone banco como propiedad readonly', () => {
    const error = new SinMovimientosError('cartola.pdf', 'BCI');

    expect(error.name).toBe('SinMovimientosError');
    expect(error.banco).toBe('BCI');
  });

  it('el mensaje contiene el nombre del archivo', () => {
    const error = new SinMovimientosError('cartola.pdf', 'BCI');

    expect(error.message).toContain('cartola.pdf');
  });

  it('el mensaje no contiene ningún dígito — guarda estructural contra una futura interpolación de montos', () => {
    const error = new SinMovimientosError('cartola.pdf', 'BCI');

    expect(error.message).not.toMatch(/\d/);
  });

  it('es instancia de Error', () => {
    const error = new SinMovimientosError('cartola.pdf', 'BCI');

    expect(error).toBeInstanceOf(Error);
  });
});
