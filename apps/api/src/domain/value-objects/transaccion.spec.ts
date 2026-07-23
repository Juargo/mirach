import { describe, it, expect } from 'vitest';
import { Transaccion } from './transaccion';
import { TransaccionInvalidaError } from '../errors/transaccion-invalida.error';

describe('Transaccion (VO)', () => {
  const fecha = new Date('2026-07-01T00:00:00.000Z');

  describe('crear — casos válidos', () => {
    it('crea una transacción de cargo (débito): cargo > 0, abono = 0', () => {
      const r = Transaccion.crear({ fecha, descripcion: 'Arriendo', cargo: 400_000, abono: 0 });

      expect(r.isOk()).toBe(true);
      const tx = r.getValue();
      expect(tx.cargo).toBe(400_000);
      expect(tx.abono).toBe(0);
      expect(tx.descripcion).toBe('Arriendo');
      expect(tx.fecha).toEqual(fecha);
    });

    it('crea una transacción de abono (crédito): abono > 0, cargo = 0', () => {
      const r = Transaccion.crear({ fecha, descripcion: 'Sueldo', cargo: 0, abono: 1_500_000 });

      expect(r.isOk()).toBe(true);
      expect(r.getValue().abono).toBe(1_500_000);
    });
  });

  describe('crear — invariantes protegidos', () => {
    it('rechaza cargo negativo', () => {
      const r = Transaccion.crear({ fecha, descripcion: 'x', cargo: -1, abono: 0 });
      expect(r.isFail()).toBe(true);
      expect(r.getError()).toBeInstanceOf(TransaccionInvalidaError);
    });

    it('rechaza abono negativo', () => {
      const r = Transaccion.crear({ fecha, descripcion: 'x', cargo: 0, abono: -1 });
      expect(r.isFail()).toBe(true);
    });

    it('rechaza cargo no entero', () => {
      const r = Transaccion.crear({ fecha, descripcion: 'x', cargo: 100.5, abono: 0 });
      expect(r.isFail()).toBe(true);
    });

    it('rechaza abono no entero', () => {
      const r = Transaccion.crear({ fecha, descripcion: 'x', cargo: 0, abono: 100.5 });
      expect(r.isFail()).toBe(true);
    });

    it('rechaza una fila sin montos (cargo = 0 y abono = 0)', () => {
      const r = Transaccion.crear({ fecha, descripcion: 'x', cargo: 0, abono: 0 });
      expect(r.isFail()).toBe(true);
    });

    it('rechaza cargo Y abono simultáneos: una línea es débito XOR crédito', () => {
      const r = Transaccion.crear({ fecha, descripcion: 'x', cargo: 100, abono: 100 });
      expect(r.isFail()).toBe(true);
    });
  });

  describe('seguridad del error', () => {
    it('el mensaje del error NO expone el monto crudo (dato sensible)', () => {
      const r = Transaccion.crear({ fecha, descripcion: 'x', cargo: 123456, abono: 654321 });
      const msg = r.getError().message;
      expect(msg).not.toContain('123456');
      expect(msg).not.toContain('654321');
    });
  });
});
