import { PeriodoAnio } from './periodo-anio';
import { AnioInvalidoError } from '../errors/anio-invalido.error';

describe('PeriodoAnio', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // ── PeriodoAnio.crear ──────────────────────────────────────────────────────

  describe('crear(anio)', () => {
    it('2026 → anio=2026, desde=2026-01-01T00:00:00.000Z, hasta=2027-01-01T00:00:00.000Z', () => {
      const result = PeriodoAnio.crear(2026);

      expect(result.isOk()).toBe(true);
      const periodo = result.getValue();
      expect(periodo.anio).toBe(2026);
      expect(periodo.desde.toISOString()).toBe('2026-01-01T00:00:00.000Z');
      expect(periodo.hasta.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    });

    it('2000 → boundary valid (lower bound)', () => {
      const result = PeriodoAnio.crear(2000);
      expect(result.isOk()).toBe(true);
      expect(result.getValue().anio).toBe(2000);
    });

    it('2100 → boundary valid (upper bound)', () => {
      const result = PeriodoAnio.crear(2100);
      expect(result.isOk()).toBe(true);
      expect(result.getValue().anio).toBe(2100);
    });

    it('1999 → Result.fail(AnioInvalidoError) — below lower bound', () => {
      const result = PeriodoAnio.crear(1999);
      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(AnioInvalidoError);
    });

    it('2101 → Result.fail(AnioInvalidoError) — above upper bound', () => {
      const result = PeriodoAnio.crear(2101);
      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(AnioInvalidoError);
    });

    it('2026.5 (non-integer) → Result.fail(AnioInvalidoError)', () => {
      const result = PeriodoAnio.crear(2026.5);
      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(AnioInvalidoError);
    });

    it('NaN → Result.fail(AnioInvalidoError)', () => {
      const result = PeriodoAnio.crear(NaN);
      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(AnioInvalidoError);
    });

    it('rawValue preserves the invalid input (for server-side logging only)', () => {
      const result = PeriodoAnio.crear(1999);
      expect(result.isFail()).toBe(true);
      expect(result.getError().rawValue).toBe(1999);
    });

    it('error message does NOT contain the raw numeric value (scrubbed for HTTP safety)', () => {
      const result = PeriodoAnio.crear(1999);
      expect(result.isFail()).toBe(true);
      expect(result.getError().message).not.toContain('1999');
    });
  });

  // ── PeriodoAnio.actual ─────────────────────────────────────────────────────

  describe('actual()', () => {
    it('with frozen clock at 2026-07-15 → anio=2026, desde/hasta year bounds', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-15T12:00:00.000Z'));

      const periodo = PeriodoAnio.actual();

      expect(periodo.anio).toBe(2026);
      expect(periodo.desde.toISOString()).toBe('2026-01-01T00:00:00.000Z');
      expect(periodo.hasta.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    });

    it('returns a PeriodoAnio instance directly (never throws)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-15T00:00:00.000Z'));

      expect(() => PeriodoAnio.actual()).not.toThrow();
      const p = PeriodoAnio.actual();
      expect(p).toBeDefined();
      expect(typeof p.anio).toBe('number');
    });
  });

  // ── PeriodoAnio.meses ──────────────────────────────────────────────────────

  describe('meses()', () => {
    it('returns exactly 12 PeriodoMes, Jan→Dec, for the given year', () => {
      const periodo = PeriodoAnio.crear(2026).getValue();
      const meses = periodo.meses();

      expect(meses).toHaveLength(12);
      expect(meses[0].valor).toBe('2026-01');
      expect(meses[11].valor).toBe('2026-12');
    });

    it('each PeriodoMes has correct desde/hasta bounds (year-rollover for December)', () => {
      const periodo = PeriodoAnio.crear(2026).getValue();
      const meses = periodo.meses();

      expect(meses[0].desde.toISOString()).toBe('2026-01-01T00:00:00.000Z');
      expect(meses[11].hasta.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    });

    it('months are in strictly ascending order', () => {
      const periodo = PeriodoAnio.crear(2026).getValue();
      const meses = periodo.meses();

      for (let i = 1; i < meses.length; i++) {
        expect(meses[i].desde.getTime()).toBeGreaterThan(
          meses[i - 1].desde.getTime(),
        );
      }
    });
  });
});
