import { ResumenAnual } from '../../../domain/value-objects/resumen-anual';
import { ResumenMes } from '../../../domain/value-objects/resumen-mes';
import { Bucket } from '../../../domain/value-objects/bucket';
import { PeriodoAnio } from '../../../domain/value-objects/periodo-anio';
import { DiaCorte } from '../../../domain/value-objects/mes-financiero';
import { aResumenAnualDto } from './resumen-anual.dto';

// ──────────────────────────────────────────────────────────────────────────────
// Unit tests — ResumenAnualDto mapper (US-030 Slice A).
// Reuses aResumenMesDto per month — this spec only covers the annual wrapping
// (anio field, 12-entry meses array, Jan→Dec periodo labels), not the
// per-bucket mapping already covered by resumen-mes.dto.spec.ts.
// ──────────────────────────────────────────────────────────────────────────────

function mesVacio(): ResumenMes {
  return ResumenMes.crear({
    totalIngreso: 0n,
    necesidades: 0n,
    deseos: 0n,
    ahorro: 0n,
  });
}

function mesConIngreso(totalIngreso: bigint, necesidades: bigint): ResumenMes {
  return ResumenMes.crear({
    totalIngreso,
    necesidades,
    deseos: 0n,
    ahorro: 0n,
  });
}

/** The 12 financial months of 2026 for the given cut-off day (#111). */
function meses2026(diaCorte: DiaCorte = DiaCorte.CALENDARIO) {
  return PeriodoAnio.crear(2026).getValue().meses(diaCorte);
}

describe('aResumenAnualDto', () => {
  it('anio field matches ResumenAnual.anio', () => {
    const meses = Array.from({ length: 12 }, () => mesVacio());
    const resumenAnual = ResumenAnual.crear(2026, meses).getValue();

    const dto = aResumenAnualDto(resumenAnual, meses2026());

    expect(dto.anio).toBe(2026);
  });

  it('meses has exactly 12 entries', () => {
    const meses = Array.from({ length: 12 }, () => mesVacio());
    const resumenAnual = ResumenAnual.crear(2026, meses).getValue();

    const dto = aResumenAnualDto(resumenAnual, meses2026());

    expect(dto.meses).toHaveLength(12);
  });

  it('each mes entry gets the correct "YYYY-MM" periodo label, Jan→Dec', () => {
    const meses = Array.from({ length: 12 }, () => mesVacio());
    const resumenAnual = ResumenAnual.crear(2026, meses).getValue();

    const dto = aResumenAnualDto(resumenAnual, meses2026());

    expect(dto.meses[0].periodo).toBe('2026-01');
    expect(dto.meses[5].periodo).toBe('2026-06');
    expect(dto.meses[11].periodo).toBe('2026-12');
  });

  it('each mes entry carries the dates of its own financial month (#111)', () => {
    const meses = Array.from({ length: 12 }, () => mesVacio());
    const resumenAnual = ResumenAnual.crear(2026, meses).getValue();
    const corte25 = DiaCorte.crear(25).getValue();

    const dto = aResumenAnualDto(resumenAnual, meses2026(corte25));

    expect(dto.meses[0]).toMatchObject({
      periodo: '2026-01',
      fechaInicio: '2026-01-25',
      fechaFin: '2026-02-24',
    });
    expect(dto.meses[11]).toMatchObject({
      periodo: '2026-12',
      fechaInicio: '2026-12-25',
      fechaFin: '2027-01-24',
    });
  });

  it('calendar months carry their first and last day', () => {
    const meses = Array.from({ length: 12 }, () => mesVacio());
    const resumenAnual = ResumenAnual.crear(2026, meses).getValue();

    const dto = aResumenAnualDto(resumenAnual, meses2026());

    expect(dto.meses[1]).toMatchObject({
      fechaInicio: '2026-02-01',
      fechaFin: '2026-02-28',
    });
  });

  it('reuses aResumenMesDto per month — bucket data is preserved', () => {
    const meses = [
      mesConIngreso(1_000_000n, 500_000n),
      ...Array.from({ length: 11 }, () => mesVacio()),
    ];
    const resumenAnual = ResumenAnual.crear(2026, meses).getValue();

    const dto = aResumenAnualDto(resumenAnual, meses2026());

    expect(dto.meses[0].totalIngreso).toBe('1000000');
    expect(dto.meses[0].sinIngreso).toBe(false);
    const nec = dto.meses[0].buckets.find(
      (b) => b.bucket === Bucket.Necesidades,
    );
    expect(nec?.total).toBe('500000');
    expect(nec?.porcentajeBp).toBe(5000);

    expect(dto.meses[1].sinIngreso).toBe(true);
    expect(dto.meses[1].totalIngreso).toBe('0');
  });
});
