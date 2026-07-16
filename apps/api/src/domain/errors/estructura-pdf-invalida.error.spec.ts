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
