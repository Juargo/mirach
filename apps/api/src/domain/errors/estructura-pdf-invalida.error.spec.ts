import { EstructuraPdfInvalidaError } from './estructura-pdf-invalida.error';

describe('EstructuraPdfInvalidaError', () => {
  it('AnclaFaltante: incluye la ancla esperada', () => {
    const error = new EstructuraPdfInvalidaError('BancoEstado', [
      { tipo: 'AnclaFaltante', ancla: 'CARTOLA CUENTARUT N°' },
    ]);

    expect(error.message).toContain('CARTOLA CUENTARUT N°');
  });

  it('PeriodoFaltante: incluye una descripción del problema', () => {
    const error = new EstructuraPdfInvalidaError('BancoEstado', [
      { tipo: 'PeriodoFaltante' },
    ]);

    expect(error.message).toContain('período');
  });

  it('PdfIlegible: incluye una descripción del problema', () => {
    const error = new EstructuraPdfInvalidaError('BancoEstado', [
      { tipo: 'PdfIlegible' },
    ]);

    expect(error.message).toContain('PDF');
  });

  it.each([
    [
      'SIN_MONTOS',
      'Fila 4: el movimiento tiene fecha pero no trae monto en cargo ni en abono.',
    ],
    [
      'CARGO_Y_ABONO',
      'Fila 4: el movimiento trae monto en cargo y en abono a la vez.',
    ],
    ['MONTO_NEGATIVO', 'Fila 4: el movimiento trae un monto negativo.'],
  ] as const)(
    'MovimientoInvalido %s: nombra la fila y el motivo real, no una columna',
    (motivo, esperado) => {
      const error = new EstructuraPdfInvalidaError('BCI', [
        { tipo: 'MovimientoInvalido', fila: 4, motivo },
      ]);

      expect(error.message).toBe(
        `Estructura PDF inválida para BCI:\n  - ${esperado}`,
      );
    },
  );

  it('agrega TODOS los problemas en una sola pasada (AnclaFaltante + PeriodoFaltante)', () => {
    const error = new EstructuraPdfInvalidaError('BancoEstado', [
      { tipo: 'AnclaFaltante', ancla: 'SALDO' },
      { tipo: 'PeriodoFaltante' },
    ]);

    expect(error.message).toContain('SALDO');
    expect(error.message).toContain('período');
    expect(error.problemas).toHaveLength(2);
  });

  it('el nombre del error es EstructuraPdfInvalidaError', () => {
    const error = new EstructuraPdfInvalidaError('BancoEstado', []);
    expect(error.name).toBe('EstructuraPdfInvalidaError');
  });
});
