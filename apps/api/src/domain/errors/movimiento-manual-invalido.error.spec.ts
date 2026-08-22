import { describe, it, expect } from 'vitest';
import {
  MovimientoManualInvalidoError,
  MotivoMovimientoManualInvalido,
} from './movimiento-manual-invalido.error';

describe('MovimientoManualInvalidoError', () => {
  it('construye con un mensaje fijo y el código como propiedad', () => {
    const error = new MovimientoManualInvalidoError('FECHA_FUTURA');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(MovimientoManualInvalidoError);
    expect(error.name).toBe('MovimientoManualInvalidoError');
    expect(error.code).toBe('FECHA_FUTURA');
  });

  it('el mensaje es una constante fija: no interpola ningún valor del request', () => {
    const error = new MovimientoManualInvalidoError('MONTO_INVALIDO');

    // El mensaje nunca contiene montos crudos (ADR-013, scrub-safe)
    expect(error.message).not.toContain('monto');
    expect(error.message).not.toContain('12345');
    expect(error.message).not.toContain('amount');
  });

  it('el mensaje es idéntico para cualquier código (constante de compilación)', () => {
    const a = new MovimientoManualInvalidoError('FECHA_FUTURA');
    const b = new MovimientoManualInvalidoError('MONTO_OVERFLOW');

    expect(a.message).toBe(b.message);
  });

  it('todos los 8 códigos de MotivoMovimientoManualInvalido son representables', () => {
    const codigos: MotivoMovimientoManualInvalido[] = [
      'FECHA_FUTURA',
      'DESCRIPCION_VACIA',
      'DESCRIPCION_LARGA',
      'MONTO_INVALIDO',
      'MONTO_OVERFLOW',
      'SIN_MONTOS',
      'MONTO_NEGATIVO',
      'CARGO_Y_ABONO',
    ];

    for (const codigo of codigos) {
      const error = new MovimientoManualInvalidoError(codigo);
      expect(error.code).toBe(codigo);
      expect(error).toBeInstanceOf(MovimientoManualInvalidoError);
    }
  });

  it('es instancia de Error (hereda correctamente)', () => {
    const error = new MovimientoManualInvalidoError('DESCRIPCION_VACIA');

    expect(error instanceof Error).toBe(true);
  });

  it('no interpola categoriaId ni ningún dato de la request en el mensaje (scrub-safe)', () => {
    const error = new MovimientoManualInvalidoError('DESCRIPCION_VACIA');

    // No debe contener datos del caller
    expect(error.message).not.toContain('cat_');
    expect(error.message).not.toContain('userId');
    expect(error.message).not.toContain('fecha');
  });
});
