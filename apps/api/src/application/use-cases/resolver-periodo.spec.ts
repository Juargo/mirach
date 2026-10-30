import { resolverPeriodo } from './resolver-periodo';
import { IUltimoPeriodoConDatosReader } from '../ports/ultimo-periodo-con-datos.port';
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import { DiaCorte } from '../../domain/value-objects/mes-financiero';
import { PeriodoInvalidoError } from '../../domain/errors/periodo-invalido.error';

// ──────────────────────────────────────────────────────────────────────────────
// resolverPeriodo — issue #747: reemplaza el ternario `input.periodo ===
// undefined ? PeriodoMes.actual() : PeriodoMes.crear(input.periodo)`
// repetido en los 6 use cases de lectura mensual. Decisión de producto:
// período ausente → último mes del usuario CON datos; sin ninguna
// transacción → fallback a PeriodoMes.actual(). Un período EXPLÍCITO
// (incluso vacío o inválido) siempre se respeta tal cual, sin tocar el
// reader de "último período con datos".
// ──────────────────────────────────────────────────────────────────────────────

function makeReader(periodo: PeriodoMes | null): IUltimoPeriodoConDatosReader {
  return {
    ultimoPeriodoConDatos: vi.fn().mockResolvedValue(periodo),
  };
}

describe('resolverPeriodo', () => {
  describe('período explícito — siempre se respeta, el reader NUNCA se toca', () => {
    it('período explícito válido → se resuelve tal cual', async () => {
      const reader = makeReader(PeriodoMes.crear('2026-03').getValue());

      const result = await resolverPeriodo(
        reader,
        'user-a',
        '2026-07',
        DiaCorte.CALENDARIO,
      );

      expect(result.isOk()).toBe(true);
      expect(result.getValue().valor).toBe('2026-07');
      expect(reader.ultimoPeriodoConDatos).not.toHaveBeenCalled();
    });

    it('período explícito inválido → Result.fail(PeriodoInvalidoError)', async () => {
      const reader = makeReader(null);

      const result = await resolverPeriodo(
        reader,
        'user-a',
        'not-a-date',
        DiaCorte.CALENDARIO,
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PeriodoInvalidoError);
      expect(reader.ultimoPeriodoConDatos).not.toHaveBeenCalled();
    });

    it('período explícito VACÍO → Result.fail, se respeta como explícito (nunca cae al resolver de datos)', async () => {
      const reader = makeReader(PeriodoMes.crear('2026-05').getValue());

      const result = await resolverPeriodo(
        reader,
        'user-a',
        '',
        DiaCorte.CALENDARIO,
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PeriodoInvalidoError);
      expect(reader.ultimoPeriodoConDatos).not.toHaveBeenCalled();
    });
  });

  describe('período ausente — resuelve por el último mes con datos', () => {
    it('usuario CON transacciones → resuelve al último mes con datos, NO al mes en curso', async () => {
      const ultimo = PeriodoMes.crear('2026-03').getValue();
      const reader = makeReader(ultimo);

      const result = await resolverPeriodo(
        reader,
        'user-a',
        undefined,
        DiaCorte.CALENDARIO,
      );

      expect(result.isOk()).toBe(true);
      expect(result.getValue().valor).toBe('2026-03');
      expect(reader.ultimoPeriodoConDatos).toHaveBeenCalledWith(
        'user-a',
        DiaCorte.CALENDARIO,
      );
      expect(reader.ultimoPeriodoConDatos).toHaveBeenCalledTimes(1);
    });

    it('usuario SIN ninguna transacción → fallback a PeriodoMes.actual() (mes UTC actual)', async () => {
      const now = new Date();
      const expectedPeriodo = `${now.getUTCFullYear()}-${String(
        now.getUTCMonth() + 1,
      ).padStart(2, '0')}`;
      const reader = makeReader(null);

      const result = await resolverPeriodo(
        reader,
        'user-a',
        undefined,
        DiaCorte.CALENDARIO,
      );

      expect(result.isOk()).toBe(true);
      expect(result.getValue().valor).toBe(expectedPeriodo);
    });
  });
  describe('mes financiero (#111) — el día de corte del perfil', () => {
    const corte25 = DiaCorte.crear(25).getValue();

    it('período explícito → PeriodoMes.crear recibe el corte (2026-10 = 25 oct – 24 nov)', async () => {
      const reader = makeReader(null);

      const result = await resolverPeriodo(
        reader,
        'user-a',
        '2026-10',
        corte25,
      );

      expect(result.getValue().valor).toBe('2026-10');
      expect(result.getValue().diaCorte.valor).toBe(25);
      expect(result.getValue().fechaInicio).toBe('2026-10-25');
      expect(result.getValue().fechaFin).toBe('2026-11-24');
    });

    it('período ausente → el reader recibe el corte y el fallback lo conserva', async () => {
      const reader = makeReader(null);

      const result = await resolverPeriodo(
        reader,
        'user-a',
        undefined,
        corte25,
      );

      expect(reader.ultimoPeriodoConDatos).toHaveBeenCalledWith(
        'user-a',
        corte25,
      );
      expect(result.getValue().diaCorte.valor).toBe(25);
    });
  });
});
