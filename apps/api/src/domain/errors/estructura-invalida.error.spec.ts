import { EstructuraInvalidaError } from './estructura-invalida.error';

describe('EstructuraInvalidaError', () => {
  it('ColumnaFaltante: incluye columna y encabezado esperado/encontrado', () => {
    const error = new EstructuraInvalidaError('BancoEstado', [
      { tipo: 'ColumnaFaltante', columna: 'A1', esperado: 'Fecha', encontrado: 'Otra cosa' },
    ]);

    expect(error.message).toContain('A1');
    expect(error.message).toContain('Fecha');
  });

  it('TipoIncorrecto: incluye fila y columna pero NUNCA el valor crudo (podría ser un monto)', () => {
    const error = new EstructuraInvalidaError('BancoEstado', [
      {
        tipo: 'TipoIncorrecto',
        columna: 'C',
        fila: 15,
        tipoEsperado: 'Numero',
        valor: '1.500.000',
      },
    ]);

    expect(error.message).toContain('Fila 15');
    expect(error.message).toContain('columna "C"');
    expect(error.message).toContain('Numero');
    expect(error.message).not.toContain('1.500.000');
  });

  it('SinEncabezados: incluye la fila', () => {
    const error = new EstructuraInvalidaError('BancoEstado', [
      { tipo: 'SinEncabezados', fila: 1 },
    ]);

    expect(error.message).toContain('1');
  });
});
