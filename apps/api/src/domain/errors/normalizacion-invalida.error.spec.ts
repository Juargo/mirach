import { NormalizacionInvalidaError } from './normalizacion-invalida.error';

describe('NormalizacionInvalidaError', () => {
  describe('MontoIninterpretable', () => {
    it('reporta fila y columna sin interpolar el monto crudo', () => {
      const error = new NormalizacionInvalidaError('BancoEstado', [
        { tipo: 'MontoIninterpretable', fila: 15, columna: 'Cargo' },
      ]);

      expect(error.message).toContain('Fila 15');
      expect(error.message).toContain('columna "Cargo"');
      expect(error.message).toContain('no se pudo interpretar');
    });

    it('no expone el valor monetario crudo en el mensaje', () => {
      const montoCrudo = '$1.234.567,89';
      const error = new NormalizacionInvalidaError('BCI', [
        { tipo: 'MontoIninterpretable', fila: 8, columna: 'Abono' },
      ]);

      expect(error.message).not.toContain(montoCrudo);
      expect(error.message).not.toMatch(/monto\s*"/);
    });
  });

  describe('FechaIninterpretable', () => {
    it('mantiene el valor de fecha en el mensaje (no es dato monetario)', () => {
      const error = new NormalizacionInvalidaError('Santander', [
        { tipo: 'FechaIninterpretable', fila: 3, valor: '32/13/2026' },
      ]);

      expect(error.message).toContain('fecha "32/13/2026"');
    });
  });

  describe('FilaSinMontos', () => {
    it('reporta solo la fila', () => {
      const error = new NormalizacionInvalidaError('BancoEstado', [
        { tipo: 'FilaSinMontos', fila: 20 },
      ]);

      expect(error.message).toContain('Fila 20: no tiene ni cargo ni abono.');
    });
  });
});
