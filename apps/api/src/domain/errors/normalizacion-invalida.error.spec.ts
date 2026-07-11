import { NormalizacionInvalidaError } from './normalizacion-invalida.error';

describe('NormalizacionInvalidaError', () => {
  describe('FilaSinMontos', () => {
    it('reporta solo la fila', () => {
      const error = new NormalizacionInvalidaError('BancoEstado', [
        { tipo: 'FilaSinMontos', fila: 20 },
      ]);

      expect(error.message).toContain('Fila 20: no tiene ni cargo ni abono.');
    });
  });

  describe('FechaIninterpretable', () => {
    it('incluye la fila pero NUNCA el valor crudo (la celda podría contener cualquier dato)', () => {
      const error = new NormalizacionInvalidaError('Santander', [
        { tipo: 'FechaIninterpretable', fila: 3, valor: '32/13/2026' },
      ]);

      expect(error.message).toContain('Fila 3');
      expect(error.message).toContain('la fecha no se pudo interpretar');
      expect(error.message).not.toContain('32/13/2026');
    });
  });

  describe('MontoIninterpretable', () => {
    it('reporta fila y columna sin interpolar el monto crudo', () => {
      const error = new NormalizacionInvalidaError('BancoEstado', [
        { tipo: 'MontoIninterpretable', fila: 15, columna: 'Cargo' },
      ]);

      expect(error.message).toContain('Fila 15');
      expect(error.message).toContain('columna "Cargo"');
      expect(error.message).toContain('no se pudo interpretar');
    });

    it('no expone valores monetarios en el mensaje', () => {
      const error = new NormalizacionInvalidaError('BCI', [
        { tipo: 'MontoIninterpretable', fila: 8, columna: 'Abono' },
      ]);

      expect(error.message).not.toMatch(/\$|\d{4,}/);
    });
  });
});
