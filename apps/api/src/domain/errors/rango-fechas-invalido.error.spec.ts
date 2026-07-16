import { RangoFechasInvalidoError } from './rango-fechas-invalido.error';

describe('RangoFechasInvalidoError', () => {
  it('el mensaje incluye el banco', () => {
    const error = new RangoFechasInvalidoError('BancoEstado');
    expect(error.message).toContain('BancoEstado');
    expect(error.message).toContain('período');
  });

  it('el nombre del error es RangoFechasInvalidoError', () => {
    const error = new RangoFechasInvalidoError('BancoEstado');
    expect(error.name).toBe('RangoFechasInvalidoError');
  });
});
