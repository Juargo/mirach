import { describe, it, expect } from 'vitest';
import { MovimientoManual } from './movimiento-manual';
import type { MotivoMovimientoManualInvalido } from '../errors/movimiento-manual-invalido.error';

/** Clock fijo: 2026-08-21 UTC */
const HOY_UTC = new Date('2026-08-21T00:00:00.000Z');
const clockHoy = () => HOY_UTC;

/** Fecha hoy en UTC */
const FECHA_HOY = new Date('2026-08-21T00:00:00.000Z');
/** Fecha mañana en UTC */
const FECHA_MANANA = new Date('2026-08-22T00:00:00.000Z');
/** Fecha en el pasado (sin límite) */
const FECHA_PASADO = new Date('2020-01-15T00:00:00.000Z');

function failCode(
  tipo: 'Ingreso' | 'Gasto',
  fecha: Date,
  descripcion: string,
  monto: string,
): MotivoMovimientoManualInvalido {
  const r = MovimientoManual.crear({
    tipo,
    fecha,
    descripcion,
    monto,
    clock: clockHoy,
  });
  expect(r.isFail()).toBe(true);
  return r.getError().code;
}

describe('MovimientoManual.crear', () => {
  describe('Ingreso — happy path', () => {
    it('mapea tipo=Ingreso a {cargo:0n, abono:montoN}', () => {
      const r = MovimientoManual.crear({
        tipo: 'Ingreso',
        fecha: FECHA_HOY,
        descripcion: 'Reembolso',
        monto: '45000',
        clock: clockHoy,
      });

      expect(r.isOk()).toBe(true);
      const vo = r.getValue();
      expect(vo.transaccion.cargo).toBe(0n);
      expect(vo.transaccion.abono).toBe(45_000n);
      expect(vo.tipo).toBe('Ingreso');
      expect(vo.esIngreso()).toBe(true);
    });
  });

  describe('Gasto — happy path', () => {
    it('mapea tipo=Gasto a {cargo:montoN, abono:0n}', () => {
      const r = MovimientoManual.crear({
        tipo: 'Gasto',
        fecha: FECHA_HOY,
        descripcion: 'Arriendo',
        monto: '500000',
        clock: clockHoy,
      });

      expect(r.isOk()).toBe(true);
      const vo = r.getValue();
      expect(vo.transaccion.cargo).toBe(500_000n);
      expect(vo.transaccion.abono).toBe(0n);
      expect(vo.tipo).toBe('Gasto');
      expect(vo.esIngreso()).toBe(false);
    });
  });

  describe('validación de monto', () => {
    it('monto no numérico ⇒ MONTO_INVALIDO', () => {
      expect(failCode('Ingreso', FECHA_HOY, 'x', 'abc')).toBe('MONTO_INVALIDO');
    });

    it('monto string negativo ⇒ MONTO_INVALIDO', () => {
      expect(failCode('Ingreso', FECHA_HOY, 'x', '-500')).toBe(
        'MONTO_INVALIDO',
      );
    });

    it('monto float string ⇒ MONTO_INVALIDO', () => {
      expect(failCode('Ingreso', FECHA_HOY, 'x', '12.50')).toBe(
        'MONTO_INVALIDO',
      );
    });

    it('monto vacío ("") ⇒ MONTO_INVALIDO', () => {
      expect(failCode('Ingreso', FECHA_HOY, 'x', '')).toBe('MONTO_INVALIDO');
    });

    it('monto cuya magnitud numérica supera Number.MAX_SAFE_INTEGER ⇒ MONTO_OVERFLOW', () => {
      const overflowStr = String(Number.MAX_SAFE_INTEGER + 1);
      expect(failCode('Ingreso', FECHA_HOY, 'x', overflowStr)).toBe(
        'MONTO_OVERFLOW',
      );
    });

    it('monto exactamente Number.MAX_SAFE_INTEGER ⇒ ok (boundary exacto, sin float)', () => {
      const exactStr = String(Number.MAX_SAFE_INTEGER);
      const r = MovimientoManual.crear({
        tipo: 'Ingreso',
        fecha: FECHA_HOY,
        descripcion: 'Límite exacto',
        monto: exactStr,
        clock: clockHoy,
      });
      expect(r.isOk()).toBe(true);
      expect(r.getValue().transaccion.abono).toBe(
        BigInt(Number.MAX_SAFE_INTEGER),
      );
    });

    it('monto="0" ⇒ SIN_MONTOS (mapeado desde Transaccion.crear)', () => {
      expect(failCode('Ingreso', FECHA_HOY, 'x', '0')).toBe('SIN_MONTOS');
    });
  });

  describe('validación de descripcion', () => {
    it('descripcion vacía ⇒ DESCRIPCION_VACIA', () => {
      expect(failCode('Ingreso', FECHA_HOY, '', '1000')).toBe(
        'DESCRIPCION_VACIA',
      );
    });

    it('descripcion solo espacios ⇒ DESCRIPCION_VACIA', () => {
      expect(failCode('Ingreso', FECHA_HOY, '   ', '1000')).toBe(
        'DESCRIPCION_VACIA',
      );
    });

    it('descripcion > 500 chars ⇒ DESCRIPCION_LARGA', () => {
      const larga = 'a'.repeat(501);
      expect(failCode('Ingreso', FECHA_HOY, larga, '1000')).toBe(
        'DESCRIPCION_LARGA',
      );
    });

    it('descripcion de exactamente 500 chars ⇒ ok (límite inclusivo)', () => {
      const exacta = 'a'.repeat(500);
      const r = MovimientoManual.crear({
        tipo: 'Ingreso',
        fecha: FECHA_HOY,
        descripcion: exacta,
        monto: '1000',
        clock: clockHoy,
      });
      expect(r.isOk()).toBe(true);
    });

    it('descripcion válida se pasa a Transaccion.crear en su forma recortada (trim aplicado)', () => {
      const r = MovimientoManual.crear({
        tipo: 'Ingreso',
        fecha: FECHA_HOY,
        descripcion: '  valid  ',
        monto: '1000',
        clock: clockHoy,
      });
      expect(r.isOk()).toBe(true);
      // trim is applied before forwarding to Transaccion.crear
      expect(r.getValue().transaccion.descripcion).toBe('valid');
    });
  });

  describe('validación de fecha', () => {
    it('fecha = hoy (clock inyectado) ⇒ ok', () => {
      const r = MovimientoManual.crear({
        tipo: 'Ingreso',
        fecha: FECHA_HOY,
        descripcion: 'Hoy',
        monto: '1000',
        clock: clockHoy,
      });
      expect(r.isOk()).toBe(true);
    });

    it('fecha = mañana ⇒ FECHA_FUTURA', () => {
      expect(failCode('Ingreso', FECHA_MANANA, 'x', '1000')).toBe(
        'FECHA_FUTURA',
      );
    });

    it('fecha pasada sin límite ⇒ ok', () => {
      const r = MovimientoManual.crear({
        tipo: 'Ingreso',
        fecha: FECHA_PASADO,
        descripcion: 'Backfill',
        monto: '99000',
        clock: clockHoy,
      });
      expect(r.isOk()).toBe(true);
    });
  });

  describe('mapeo de errores de Transaccion.crear', () => {
    it('CARGO_Y_ABONO arm está en MotivoMovimientoManualInvalido (compile-time exhaustiveness)', () => {
      // CARGO_Y_ABONO es estructuralmente inalcanzable en tiempo de ejecución
      // desde MovimientoManual.crear (D-09), pero el tipo debe incluirlo para
      // que TypeScript pueda exhaustar el union de MotivoTransaccionInvalida.
      // Este test solo verifica que el tipo existe como valor de la union.
      const codigo: MotivoMovimientoManualInvalido = 'CARGO_Y_ABONO';
      expect(codigo).toBe('CARGO_Y_ABONO');
    });
  });

  describe('nunca lanza excepciones', () => {
    it('todos los path de fallo retornan Result.fail, nunca throw', () => {
      const casos: Array<[string, string, string]> = [
        ['Ingreso', '', '1000'],
        ['Ingreso', 'x', 'abc'],
        ['Ingreso', 'x', '-1'],
        ['Ingreso', 'x', '0'],
      ];

      for (const [tipo, desc, monto] of casos) {
        expect(() => {
          MovimientoManual.crear({
            tipo: tipo as 'Ingreso' | 'Gasto',
            fecha: FECHA_HOY,
            descripcion: desc,
            monto,
            clock: clockHoy,
          });
        }).not.toThrow();
      }
    });
  });
});
