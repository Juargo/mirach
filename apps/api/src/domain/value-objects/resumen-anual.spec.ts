import { ResumenAnual } from './resumen-anual';
import { ResumenMes } from './resumen-mes';
import { ResumenAnualInvalidoError } from '../errors/resumen-anual-invalido.error';

// ──────────────────────────────────────────────────────────────────────────────
// ResumenAnual VO — "exactly 12 months" invariant (US-030 Slice A fix pass).
// crear() must fail-closed with ResumenAnualInvalidoError instead of silently
// accepting a wrong-length meses array (which would mislabel/truncate months
// at the DTO boundary, since aResumenAnualDto derives "YYYY-MM" from index).
// ──────────────────────────────────────────────────────────────────────────────

function unResumenMesVacio(): ResumenMes {
  return ResumenMes.crear({
    totalIngreso: 0n,
    necesidades: 0n,
    deseos: 0n,
    ahorro: 0n,
    sinCategoria: 0n,
  });
}

function doceMeses(): ResumenMes[] {
  return Array.from({ length: 12 }, () => unResumenMesVacio());
}

describe('ResumenAnual', () => {
  describe('crear(anio, meses)', () => {
    it('exactly 12 meses → Result.ok(ResumenAnual) with anio and meses set', () => {
      const meses = doceMeses();
      const result = ResumenAnual.crear(2026, meses);

      expect(result.isOk()).toBe(true);
      const resumenAnual = result.getValue();
      expect(resumenAnual.anio).toBe(2026);
      expect(resumenAnual.meses).toHaveLength(12);
      expect(resumenAnual.meses).toBe(meses);
    });

    it('fewer than 12 meses (11) → Result.fail(ResumenAnualInvalidoError)', () => {
      const meses = doceMeses().slice(0, 11);
      const result = ResumenAnual.crear(2026, meses);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ResumenAnualInvalidoError);
    });

    it('more than 12 meses (13) → Result.fail(ResumenAnualInvalidoError)', () => {
      const meses = [...doceMeses(), unResumenMesVacio()];
      const result = ResumenAnual.crear(2026, meses);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ResumenAnualInvalidoError);
    });

    it('empty meses array → Result.fail(ResumenAnualInvalidoError)', () => {
      const result = ResumenAnual.crear(2026, []);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ResumenAnualInvalidoError);
    });

    it('failure carries the actual received length for server-side logging', () => {
      const result = ResumenAnual.crear(2026, doceMeses().slice(0, 5));

      expect(result.isFail()).toBe(true);
      expect(result.getError().cantidadRecibida).toBe(5);
    });
  });
});
