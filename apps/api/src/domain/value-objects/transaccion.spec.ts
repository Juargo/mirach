import { describe, it, expect } from 'vitest';
import { Transaccion } from './transaccion';
import { TransaccionInvalidaError } from '../errors/transaccion-invalida.error';

describe('Transaccion (VO)', () => {
  const fecha = new Date('2026-07-01T00:00:00.000Z');

  describe('crear — casos válidos', () => {
    it('crea una transacción de cargo (débito): cargo > 0, abono = 0', () => {
      const r = Transaccion.crear({ fecha, descripcion: 'Arriendo', cargo: 400_000n, abono: 0n });

      expect(r.isOk()).toBe(true);
      const tx = r.getValue();
      expect(tx.cargo).toBe(400_000n);
      expect(tx.abono).toBe(0n);
      expect(tx.descripcion).toBe('Arriendo');
      expect(tx.fecha).toEqual(fecha);
    });

    it('crea una transacción de abono (crédito): abono > 0, cargo = 0', () => {
      const r = Transaccion.crear({ fecha, descripcion: 'Sueldo', cargo: 0n, abono: 1_500_000n });

      expect(r.isOk()).toBe(true);
      expect(r.getValue().abono).toBe(1_500_000n);
    });
  });

  describe('crear — invariantes protegidos', () => {
    it('rechaza cargo negativo', () => {
      const r = Transaccion.crear({ fecha, descripcion: 'x', cargo: -1n, abono: 0n });
      expect(r.isFail()).toBe(true);
      expect(r.getError()).toBeInstanceOf(TransaccionInvalidaError);
    });

    it('rechaza abono negativo', () => {
      const r = Transaccion.crear({ fecha, descripcion: 'x', cargo: 0n, abono: -1n });
      expect(r.isFail()).toBe(true);
    });

    it('rechaza una fila sin montos (cargo = 0 y abono = 0)', () => {
      const r = Transaccion.crear({ fecha, descripcion: 'x', cargo: 0n, abono: 0n });
      expect(r.isFail()).toBe(true);
    });

    it('rechaza cargo Y abono simultáneos: una línea es débito XOR crédito', () => {
      const r = Transaccion.crear({ fecha, descripcion: 'x', cargo: 100n, abono: 100n });
      expect(r.isFail()).toBe(true);
    });
  });

  describe('esIngreso — regla de negocio (abono > 0 y cargo = 0)', () => {
    it('es ingreso cuando hay abono y no hay cargo', () => {
      const tx = Transaccion.crear({ fecha, descripcion: 'Sueldo', cargo: 0n, abono: 1_500_000n }).getValue();
      expect(tx.esIngreso()).toBe(true);
    });

    it('no es ingreso cuando hay cargo', () => {
      const tx = Transaccion.crear({ fecha, descripcion: 'Arriendo', cargo: 400_000n, abono: 0n }).getValue();
      expect(tx.esIngreso()).toBe(false);
    });

    it('el estático evalúa la regla sin construir una instancia (para el read model de categorización)', () => {
      expect(Transaccion.esIngreso(0n, 1_500_000n)).toBe(true);
      expect(Transaccion.esIngreso(400_000n, 0n)).toBe(false);
    });
  });

  describe('seguridad del error', () => {
    it('el mensaje del error NO expone el monto crudo (dato sensible)', () => {
      const r = Transaccion.crear({ fecha, descripcion: 'x', cargo: 123456n, abono: 654321n });
      const msg = r.getError().message;
      expect(msg).not.toContain('123456');
      expect(msg).not.toContain('654321');
    });
  });
});
