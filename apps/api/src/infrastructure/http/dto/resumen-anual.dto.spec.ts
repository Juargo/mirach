import { ResumenAnual } from '../../../domain/value-objects/resumen-anual';
import { ResumenMes } from '../../../domain/value-objects/resumen-mes';
import { Bucket } from '../../../domain/value-objects/bucket';
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
    sinCategoria: 0n,
  });
}

function mesConIngreso(totalIngreso: bigint, necesidades: bigint): ResumenMes {
  return ResumenMes.crear({
    totalIngreso,
    necesidades,
    deseos: 0n,
    ahorro: 0n,
    sinCategoria: 0n,
  });
}

describe('aResumenAnualDto', () => {
  it('anio field matches ResumenAnual.anio', () => {
    const meses = Array.from({ length: 12 }, () => mesVacio());
    const resumenAnual = ResumenAnual.crear(2026, meses).getValue();

    const dto = aResumenAnualDto(resumenAnual);

    expect(dto.anio).toBe(2026);
  });

  it('meses has exactly 12 entries', () => {
    const meses = Array.from({ length: 12 }, () => mesVacio());
    const resumenAnual = ResumenAnual.crear(2026, meses).getValue();

    const dto = aResumenAnualDto(resumenAnual);

    expect(dto.meses).toHaveLength(12);
  });

  it('each mes entry gets the correct "YYYY-MM" periodo label, Jan→Dec', () => {
    const meses = Array.from({ length: 12 }, () => mesVacio());
    const resumenAnual = ResumenAnual.crear(2026, meses).getValue();

    const dto = aResumenAnualDto(resumenAnual);

    expect(dto.meses[0].periodo).toBe('2026-01');
    expect(dto.meses[5].periodo).toBe('2026-06');
    expect(dto.meses[11].periodo).toBe('2026-12');
  });

  it('reuses aResumenMesDto per month — bucket data is preserved', () => {
    const meses = [
      mesConIngreso(1_000_000n, 500_000n),
      ...Array.from({ length: 11 }, () => mesVacio()),
    ];
    const resumenAnual = ResumenAnual.crear(2026, meses).getValue();

    const dto = aResumenAnualDto(resumenAnual);

    expect(dto.meses[0].totalIngreso).toBe('1000000');
    expect(dto.meses[0].sinIngreso).toBe(false);
    const nec = dto.meses[0].buckets.find((b) => b.bucket === Bucket.Necesidades);
    expect(nec?.total).toBe('500000');
    expect(nec?.porcentajeBp).toBe(5000);

    expect(dto.meses[1].sinIngreso).toBe(true);
    expect(dto.meses[1].totalIngreso).toBe('0');
  });
});
