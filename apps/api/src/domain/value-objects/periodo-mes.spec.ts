import { PeriodoMes } from './periodo-mes';
import { PeriodoInvalidoError } from '../errors/periodo-invalido.error';

describe('PeriodoMes', () => {
  afterEach(() => {
    jest.useRealTimers();
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
      expect(result.getValue().desde.toISOString()).toBe('2026-01-01T00:00:00.000Z');
      expect(result.getValue().hasta.toISOString()).toBe('2026-02-01T00:00:00.000Z');
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
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-07-15T12:00:00.000Z'));

      const periodo = PeriodoMes.actual();

      expect(periodo.valor).toBe('2026-07');
      expect(periodo.desde.toISOString()).toBe('2026-07-01T00:00:00.000Z');
      expect(periodo.hasta.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    });

    it('with frozen clock at December 2026-12-01 → hasta=2027-01-01T00:00:00.000Z (year-boundary case)', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-12-01T00:00:00.000Z'));

      const periodo = PeriodoMes.actual();

      expect(periodo.valor).toBe('2026-12');
      expect(periodo.desde.toISOString()).toBe('2026-12-01T00:00:00.000Z');
      expect(periodo.hasta.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    });

    it('returns a PeriodoMes instance directly (never throws)', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-07-15T00:00:00.000Z'));

      expect(() => PeriodoMes.actual()).not.toThrow();
      const p = PeriodoMes.actual();
      expect(p).toBeDefined();
      expect(typeof p.valor).toBe('string');
      expect(p.desde).toBeInstanceOf(Date);
      expect(p.hasta).toBeInstanceOf(Date);
    });
  });
});
