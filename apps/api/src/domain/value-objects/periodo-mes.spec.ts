import { PeriodoMes } from './periodo-mes';
import { DiaCorte } from './mes-financiero';
import { PeriodoInvalidoError } from '../errors/periodo-invalido.error';

describe('PeriodoMes', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // ── PeriodoMes.crear ───────────────────────────────────────────────────────

  describe('crear(raw)', () => {
    it('2026-07 → desde=2026-07-01T00:00:00.000Z, hasta=2026-08-01T00:00:00.000Z', () => {
      const result = PeriodoMes.crear('2026-07');

      expect(result.isOk()).toBe(true);
      const periodo = result.getValue();
      expect(periodo.valor).toBe('2026-07');
      expect(periodo.desde.toISOString()).toBe('2026-07-01T00:00:00.000Z');
      expect(periodo.hasta.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    });

    it('2026-12 → hasta=2027-01-01T00:00:00.000Z (year-rollover case)', () => {
      const result = PeriodoMes.crear('2026-12');

      expect(result.isOk()).toBe(true);
      const periodo = result.getValue();
      expect(periodo.valor).toBe('2026-12');
      expect(periodo.desde.toISOString()).toBe('2026-12-01T00:00:00.000Z');
      expect(periodo.hasta.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    });

    it('hasta is exclusive — first instant of next month', () => {
      const result = PeriodoMes.crear('2026-07');
      expect(result.isOk()).toBe(true);
      const { desde, hasta } = result.getValue();
      // hasta must be strictly after desde
      expect(hasta.getTime()).toBeGreaterThan(desde.getTime());
      // hasta must equal first instant of August 2026
      expect(hasta.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    });

    it('2026-01 → desde=2026-01-01T00:00:00.000Z (first month of year)', () => {
      const result = PeriodoMes.crear('2026-01');
      expect(result.isOk()).toBe(true);
      expect(result.getValue().desde.toISOString()).toBe(
        '2026-01-01T00:00:00.000Z',
      );
      expect(result.getValue().hasta.toISOString()).toBe(
        '2026-02-01T00:00:00.000Z',
      );
    });

    // ── Invalid inputs ──

    it('2026-07-01 (extra chars) → Result.fail(PeriodoInvalidoError)', () => {
      const result = PeriodoMes.crear('2026-07-01');
      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PeriodoInvalidoError);
    });

    it('2026-13 → Result.fail(PeriodoInvalidoError) — month out of range', () => {
      const result = PeriodoMes.crear('2026-13');
      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PeriodoInvalidoError);
    });

    it('2026-00 → Result.fail(PeriodoInvalidoError) — month 0 is invalid', () => {
      const result = PeriodoMes.crear('2026-00');
      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PeriodoInvalidoError);
    });

    it('abc → Result.fail(PeriodoInvalidoError) — not a date', () => {
      const result = PeriodoMes.crear('abc');
      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PeriodoInvalidoError);
    });

    it('2026-7 → Result.fail(PeriodoInvalidoError) — month not zero-padded (AC-05)', () => {
      const result = PeriodoMes.crear('2026-7');
      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PeriodoInvalidoError);
    });

    it('2026/07 → Result.fail(PeriodoInvalidoError) — wrong separator (AC-06)', () => {
      const result = PeriodoMes.crear('2026/07');
      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PeriodoInvalidoError);
    });

    it('"" (empty string) → Result.fail(PeriodoInvalidoError) (AC-07)', () => {
      const result = PeriodoMes.crear('');
      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PeriodoInvalidoError);
    });

    it('rawValue preserves the invalid input (for server-side logging only)', () => {
      const result = PeriodoMes.crear('abc');
      expect(result.isFail()).toBe(true);
      // The raw input is stored in rawValue, NOT in message (message is scrubbed for HTTP safety).
      expect(result.getError().rawValue).toBe('abc');
    });

    it('error message does NOT contain raw input (scrubbed for HTTP safety)', () => {
      const result = PeriodoMes.crear('abc');
      expect(result.isFail()).toBe(true);
      expect(result.getError().message).not.toContain('abc');
    });

    it('error message contains format hint YYYY-MM', () => {
      const result = PeriodoMes.crear('bad');
      expect(result.isFail()).toBe(true);
      expect(result.getError().message).toContain('YYYY-MM');
    });

    it('whitespace-padded input (e.g. " 2026-07") is rejected — valor must be canonical', () => {
      const result = PeriodoMes.crear(' 2026-07');
      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PeriodoInvalidoError);
    });
  });

  // ── PeriodoMes.actual ──────────────────────────────────────────────────────

  describe('actual()', () => {
    it('with frozen clock at 2026-07-15 → valor=2026-07, desde=2026-07-01T00:00:00.000Z, hasta=2026-08-01T00:00:00.000Z', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-15T12:00:00.000Z'));

      const periodo = PeriodoMes.actual();

      expect(periodo.valor).toBe('2026-07');
      expect(periodo.desde.toISOString()).toBe('2026-07-01T00:00:00.000Z');
      expect(periodo.hasta.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    });

    it('with frozen clock at December 2026-12-01 → hasta=2027-01-01T00:00:00.000Z (year-boundary case)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-12-01T00:00:00.000Z'));

      const periodo = PeriodoMes.actual();

      expect(periodo.valor).toBe('2026-12');
      expect(periodo.desde.toISOString()).toBe('2026-12-01T00:00:00.000Z');
      expect(periodo.hasta.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    });

    it('returns a PeriodoMes instance directly (never throws)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-15T00:00:00.000Z'));

      expect(() => PeriodoMes.actual()).not.toThrow();
      const p = PeriodoMes.actual();
      expect(p).toBeDefined();
      expect(typeof p.valor).toBe('string');
      expect(p.desde).toBeInstanceOf(Date);
      expect(p.hasta).toBeInstanceOf(Date);
    });
  });
  // ── Mes financiero (#111, PER-08) ─────────────────────────────────────────

  describe('with a cut-off day', () => {
    const corte25 = DiaCorte.crear(25).getValue();

    it('2026-10 with cut-off 25 is 25 oct – 24 nov (named by the month it starts in)', () => {
      const periodo = PeriodoMes.crear('2026-10', corte25).getValue();
      expect(periodo.valor).toBe('2026-10');
      expect(periodo.desde.toISOString()).toBe('2026-10-25T00:00:00.000Z');
      expect(periodo.hasta.toISOString()).toBe('2026-11-25T00:00:00.000Z');
      expect(periodo.fechaInicio).toBe('2026-10-25');
      expect(periodo.fechaFin).toBe('2026-11-24');
    });

    it('2026-09 with cut-off 25 is 25 sep – 24 oct', () => {
      const periodo = PeriodoMes.crear('2026-09', corte25).getValue();
      expect(periodo.fechaInicio).toBe('2026-09-25');
      expect(periodo.fechaFin).toBe('2026-10-24');
    });

    it('2026-12 with cut-off 25 rolls into the next year', () => {
      const periodo = PeriodoMes.crear('2026-12', corte25).getValue();
      expect(periodo.fechaInicio).toBe('2026-12-25');
      expect(periodo.fechaFin).toBe('2027-01-24');
    });

    it('the calendar month has its own dates and no income tolerance', () => {
      const periodo = PeriodoMes.crear('2026-02').getValue();
      expect(periodo.fechaInicio).toBe('2026-02-01');
      expect(periodo.fechaFin).toBe('2026-02-28');
      expect(periodo.ingresoDesde.toISOString()).toBe(
        periodo.desde.toISOString(),
      );
      expect(periodo.ingresoHasta.toISOString()).toBe(
        periodo.hasta.toISOString(),
      );
    });

    it('income up to 3 days before the cut-off counts in the period that starts', () => {
      const periodo = PeriodoMes.crear('2026-10', corte25).getValue();
      expect(periodo.ingresoDesde.toISOString()).toBe(
        '2026-10-22T00:00:00.000Z',
      );
      expect(periodo.ingresoHasta.toISOString()).toBe(
        '2026-11-22T00:00:00.000Z',
      );
    });

    it('rejects a malformed period whatever the cut-off day', () => {
      expect(PeriodoMes.crear('2026-13', corte25).isFail()).toBe(true);
    });
  });

  describe('queContiene(fecha, diaCorte)', () => {
    const corte25 = DiaCorte.crear(25).getValue();

    it.each([
      ['2026-10-25T00:00:00.000Z', '2026-10'],
      ['2026-11-24T23:59:59.999Z', '2026-10'],
      ['2026-10-24T12:00:00.000Z', '2026-09'],
      ['2027-01-10T00:00:00.000Z', '2026-12'],
    ])('with cut-off 25, %s belongs to %s', (fecha, valor) => {
      const periodo = PeriodoMes.queContiene(new Date(fecha), corte25);
      expect(periodo.valor).toBe(valor);
      expect(periodo.diaCorte.valor).toBe(25);
    });

    it('with the calendar month, a date belongs to its own month', () => {
      const periodo = PeriodoMes.queContiene(
        new Date('2026-07-31T23:00:00.000Z'),
        DiaCorte.CALENDARIO,
      );
      expect(periodo.valor).toBe('2026-07');
    });
  });

  describe('queContieneIngreso(fecha, diaCorte)', () => {
    it('with cut-off 25, a salary on Friday 23 Oct counts in the period 25 oct – 24 nov', () => {
      const periodo = PeriodoMes.queContieneIngreso(
        new Date('2026-10-23T00:00:00.000Z'),
        DiaCorte.crear(25).getValue(),
      );
      expect(periodo.valor).toBe('2026-10');
    });

    it('with cut-off 25, income 4 days before the cut-off stays in the previous period', () => {
      const periodo = PeriodoMes.queContieneIngreso(
        new Date('2026-10-21T00:00:00.000Z'),
        DiaCorte.crear(25).getValue(),
      );
      expect(periodo.valor).toBe('2026-09');
    });

    it('with the calendar month, income on the 30th stays in its month', () => {
      const periodo = PeriodoMes.queContieneIngreso(
        new Date('2026-09-30T00:00:00.000Z'),
        DiaCorte.CALENDARIO,
      );
      expect(periodo.valor).toBe('2026-09');
    });
  });

  describe('actual(diaCorte)', () => {
    it('with cut-off 25 on 30 Oct 2026, the current period is 2026-10', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-30T12:00:00.000Z'));
      expect(PeriodoMes.actual(DiaCorte.crear(25).getValue()).valor).toBe(
        '2026-10',
      );
    });

    it('with cut-off 25 on 10 Oct 2026, the current period is 2026-09', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-10T12:00:00.000Z'));
      expect(PeriodoMes.actual(DiaCorte.crear(25).getValue()).valor).toBe(
        '2026-09',
      );
    });
  });
});
