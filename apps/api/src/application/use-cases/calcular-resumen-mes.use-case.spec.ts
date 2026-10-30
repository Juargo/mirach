import { CalcularResumenMesUseCase } from './calcular-resumen-mes.use-case';
import { IResumenMesReader, BucketSumRow } from '../ports/resumen-mes.port';
import { IUltimoPeriodoConDatosReader } from '../ports/ultimo-periodo-con-datos.port';
import { Bucket } from '../../domain/value-objects/bucket';
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import { PeriodoInvalidoError } from '../../domain/errors/periodo-invalido.error';
import { DiaCorte } from '../../domain/value-objects/mes-financiero';
import { perfilReaderConCorte } from '../../../test/support/perfil-presupuesto-reader.double';
import { NoOpLogger, FakeLogger } from '../../../test/support/logger.double';
import { IPerfilPresupuestoReader } from '../ports/perfil-presupuesto.port';
import { PerfilPresupuesto } from '../../domain/value-objects/perfil-presupuesto';

/** Budget profile reader for tests: every user has the 50/30/20 default (#110). */
const perfilPorDefecto: IPerfilPresupuestoReader = {
  obtener: () => Promise.resolve(PerfilPresupuesto.porDefecto()),
};

// ──────────────────────────────────────────────────────────────────────────────
// T-05: Unit tests — CalcularResumenMesUseCase (mocked IResumenMesReader)
// No DB, no infrastructure imports. Mirrors US-014 use-case test patterns.
// ──────────────────────────────────────────────────────────────────────────────

function makeMockReader(rows: BucketSumRow[]): IResumenMesReader {
  return {
    sumarPorBucket: vi.fn().mockResolvedValue(rows),
  };
}

/**
 * Fake de IUltimoPeriodoConDatosReader (issue #747). Por defecto `null`
 * (usuario sin ninguna transacción) — la mayoría de estos specs fija un
 * `periodo` EXPLÍCITO, así que el resolver nunca lo toca; los tests de la
 * sección "periodo resolution" lo ejercitan directamente.
 */
function makeUltimoPeriodoReader(
  periodo: PeriodoMes | null = null,
): IUltimoPeriodoConDatosReader {
  return {
    ultimoPeriodoConDatos: vi.fn().mockResolvedValue(periodo),
  };
}

function allBucketRows(
  overrides: Partial<
    Record<Bucket, { cargo?: bigint; abono?: bigint; cantidadCargos?: number }>
  > = {},
): BucketSumRow[] {
  const defaults: Record<
    Bucket,
    { cargo: bigint; abono: bigint; cantidadCargos: number }
  > = {
    [Bucket.Ingreso]: { cargo: 0n, abono: 1_500_000n, cantidadCargos: 0 },
    [Bucket.Necesidades]: { cargo: 750_000n, abono: 0n, cantidadCargos: 3 },
    [Bucket.Deseos]: { cargo: 360_000n, abono: 0n, cantidadCargos: 2 },
    [Bucket.Ahorro]: { cargo: 300_000n, abono: 0n, cantidadCargos: 1 },
  };

  return (Object.keys(defaults) as Bucket[]).map((bucket) => ({
    bucket,
    totalCargo: overrides[bucket]?.cargo ?? defaults[bucket].cargo,
    totalAbono: overrides[bucket]?.abono ?? defaults[bucket].abono,
    cantidadCargos:
      overrides[bucket]?.cantidadCargos ?? defaults[bucket].cantidadCargos,
  }));
}

describe('CalcularResumenMesUseCase', () => {
  describe('happy path (SC-01): all buckets, income present', () => {
    it('returns ok with correct totalIngreso and porcentajeBp for all buckets', async () => {
      const reader = makeMockReader(allBucketRows());
      const uc = new CalcularResumenMesUseCase(
        reader,
        makeUltimoPeriodoReader(),
        new NoOpLogger(),
        perfilPorDefecto,
      );

      const result = await uc.execute({ userId: 'user-a', periodo: '2026-07' });

      expect(result.isOk()).toBe(true);
      const { resumen } = result.getValue();
      expect(resumen.totalIngreso).toBe(1_500_000n);
      expect(resumen.sinIngreso).toBe(false);

      const [necesidades, deseos, ahorro] = resumen.buckets;
      expect(necesidades.porcentajeBp).toBe(5000n); // 50.00%
      expect(deseos.porcentajeBp).toBe(2400n); // 24.00%
      expect(ahorro.porcentajeBp).toBe(2000n); // 20.00%
    });

    it('returns the resolved periodo string', async () => {
      const reader = makeMockReader(allBucketRows());
      const uc = new CalcularResumenMesUseCase(
        reader,
        makeUltimoPeriodoReader(),
        new NoOpLogger(),
        perfilPorDefecto,
      );

      const result = await uc.execute({ userId: 'user-a', periodo: '2026-07' });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().periodo).toBe('2026-07');
    });
  });

  describe('null-fold in use case (SC-03): fold to Deseos already done by repo', () => {
    it('maps an already-folded bucket row correctly — folding is the repo responsibility', async () => {
      // The use case receives already-folded rows from the reader (port contract,
      // issue #778 tramo 5b: unrecognized bucketIds fold to Deseos, not SinCategoria).
      // Fold correctness is tested at the repository layer.
      const rows: BucketSumRow[] = [
        {
          bucket: Bucket.Ingreso,
          totalCargo: 0n,
          totalAbono: 1_000_000n,
          cantidadCargos: 0,
        },
        {
          bucket: Bucket.Deseos,
          totalCargo: 200_000n,
          totalAbono: 0n,
          cantidadCargos: 4,
        },
      ];
      const reader = makeMockReader(rows);
      const uc = new CalcularResumenMesUseCase(
        reader,
        makeUltimoPeriodoReader(),
        new NoOpLogger(),
        perfilPorDefecto,
      );

      const result = await uc.execute({ userId: 'user-a', periodo: '2026-07' });

      expect(result.isOk()).toBe(true);
      const { resumen } = result.getValue();
      const deseos = resumen.buckets.find((b) => b.bucket === Bucket.Deseos);
      expect(deseos?.total).toBe(200_000n);
      expect(deseos?.porcentajeBp).toBe(2000n); // 200000/1000000 = 20.00%
    });
  });

  describe('sinIngreso path (SC-04): no income', () => {
    it('returns ok with sinIngreso=true and all porcentajeBp=null when no Ingreso row', async () => {
      const rows: BucketSumRow[] = [
        {
          bucket: Bucket.Necesidades,
          totalCargo: 100_000n,
          totalAbono: 0n,
          cantidadCargos: 1,
        },
      ];
      const reader = makeMockReader(rows);
      const uc = new CalcularResumenMesUseCase(
        reader,
        makeUltimoPeriodoReader(),
        new NoOpLogger(),
        perfilPorDefecto,
      );

      const result = await uc.execute({ userId: 'user-a', periodo: '2026-07' });

      expect(result.isOk()).toBe(true);
      const { resumen } = result.getValue();
      expect(resumen.sinIngreso).toBe(true);
      expect(resumen.totalIngreso).toBe(0n);
      for (const slice of resumen.buckets) {
        expect(slice.porcentajeBp).toBeNull();
      }
    });

    it('is NOT a Result.fail — sinIngreso is a valid data state, not an error (SC-04)', async () => {
      const reader = makeMockReader([]);
      const uc = new CalcularResumenMesUseCase(
        reader,
        makeUltimoPeriodoReader(),
        new NoOpLogger(),
        perfilPorDefecto,
      );

      const result = await uc.execute({ userId: 'user-a', periodo: '2026-07' });

      expect(result.isFail()).toBe(false);
    });
  });

  describe('empty month (SC-05)', () => {
    it('returns ok with all zeros and sinIngreso=true when reader returns empty array', async () => {
      const reader = makeMockReader([]);
      const uc = new CalcularResumenMesUseCase(
        reader,
        makeUltimoPeriodoReader(),
        new NoOpLogger(),
        perfilPorDefecto,
      );

      const result = await uc.execute({ userId: 'user-a', periodo: '2026-07' });

      expect(result.isOk()).toBe(true);
      const { resumen } = result.getValue();
      expect(resumen.totalIngreso).toBe(0n);
      expect(resumen.sinIngreso).toBe(true);
      for (const slice of resumen.buckets) {
        expect(slice.total).toBe(0n);
        expect(slice.porcentajeBp).toBeNull();
      }
    });
  });

  describe('periodo validation', () => {
    it('absent periodo + usuario SIN datos → fallback a current UTC month (SC-07, issue #747)', async () => {
      const now = new Date();
      const expectedPeriodo = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

      const reader = makeMockReader([]);
      const uc = new CalcularResumenMesUseCase(
        reader,
        makeUltimoPeriodoReader(null),
        new NoOpLogger(),
        perfilPorDefecto,
      );

      const result = await uc.execute({ userId: 'user-a', periodo: undefined });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().periodo).toBe(expectedPeriodo);
    });

    it('absent periodo + usuario CON datos → resuelve al último mes con datos, NO al mes en curso (issue #747)', async () => {
      const reader = makeMockReader([]);
      const ultimoPeriodoReader = makeUltimoPeriodoReader(
        PeriodoMes.crear('2026-03').getValue(),
      );
      const uc = new CalcularResumenMesUseCase(
        reader,
        ultimoPeriodoReader,
        new NoOpLogger(),
        perfilPorDefecto,
      );

      const result = await uc.execute({ userId: 'user-a', periodo: undefined });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().periodo).toBe('2026-03');
      expect(ultimoPeriodoReader.ultimoPeriodoConDatos).toHaveBeenCalledWith(
        'user-a',
        DiaCorte.CALENDARIO,
      );
      expect(reader.sumarPorBucket).toHaveBeenCalledWith(
        'user-a',
        expect.objectContaining({ valor: '2026-03' }),
      );
    });

    it('periodo EXPLÍCITO → se respeta tal cual, el reader de último período NUNCA se toca (issue #747)', async () => {
      const reader = makeMockReader([]);
      const ultimoPeriodoReader = makeUltimoPeriodoReader(
        PeriodoMes.crear('2026-03').getValue(),
      );
      const uc = new CalcularResumenMesUseCase(
        reader,
        ultimoPeriodoReader,
        new NoOpLogger(),
        perfilPorDefecto,
      );

      const result = await uc.execute({ userId: 'user-a', periodo: '2026-07' });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().periodo).toBe('2026-07');
      expect(ultimoPeriodoReader.ultimoPeriodoConDatos).not.toHaveBeenCalled();
    });

    it('invalid periodo → Result.fail(PeriodoInvalidoError) (SC-08)', async () => {
      const reader = makeMockReader([]);
      const uc = new CalcularResumenMesUseCase(
        reader,
        makeUltimoPeriodoReader(),
        new NoOpLogger(),
        perfilPorDefecto,
      );

      const result = await uc.execute({
        userId: 'user-a',
        periodo: 'not-a-date',
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PeriodoInvalidoError);
    });

    it('periodo with invalid month (13) → Result.fail (SC-08)', async () => {
      const reader = makeMockReader([]);
      const uc = new CalcularResumenMesUseCase(
        reader,
        makeUltimoPeriodoReader(),
        new NoOpLogger(),
        perfilPorDefecto,
      );

      const result = await uc.execute({ userId: 'user-a', periodo: '2026-13' });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PeriodoInvalidoError);
    });

    it('periodo with month 00 → Result.fail (SC-08)', async () => {
      const reader = makeMockReader([]);
      const uc = new CalcularResumenMesUseCase(
        reader,
        makeUltimoPeriodoReader(),
        new NoOpLogger(),
        perfilPorDefecto,
      );

      const result = await uc.execute({ userId: 'user-a', periodo: '2026-00' });

      expect(result.isFail()).toBe(true);
    });
  });

  describe('income source correctness', () => {
    it('base is computed from Ingreso totalAbono, NOT totalCargo', async () => {
      // Ingreso row has cargo=999n (should be ignored for base) and abono=1_000_000n
      const rows: BucketSumRow[] = [
        {
          bucket: Bucket.Ingreso,
          totalCargo: 999n,
          totalAbono: 1_000_000n,
          cantidadCargos: 0,
        },
        {
          bucket: Bucket.Necesidades,
          totalCargo: 500_000n,
          totalAbono: 0n,
          cantidadCargos: 2,
        },
      ];
      const reader = makeMockReader(rows);
      const uc = new CalcularResumenMesUseCase(
        reader,
        makeUltimoPeriodoReader(),
        new NoOpLogger(),
        perfilPorDefecto,
      );

      const result = await uc.execute({ userId: 'user-a', periodo: '2026-07' });

      expect(result.isOk()).toBe(true);
      const { resumen } = result.getValue();
      expect(resumen.totalIngreso).toBe(1_000_000n); // from abono, not cargo
      const necesidades = resumen.buckets.find(
        (b) => b.bucket === Bucket.Necesidades,
      );
      expect(necesidades?.porcentajeBp).toBe(5000n); // 500000/1000000 = 5000bp
    });
  });

  describe('debug logging (ADR-033 slice C — redaction contract, ADR-013)', () => {
    it('NUNCA incluye montos ni descripción en los contexts logueados', async () => {
      const reader = makeMockReader(allBucketRows());
      const logger = new FakeLogger();
      const uc = new CalcularResumenMesUseCase(
        reader,
        makeUltimoPeriodoReader(),
        logger,
        perfilPorDefecto,
      );

      await uc.execute({ userId: 'user-a', periodo: '2026-07' });

      const debugCalls = logger.calls.filter((c) => c.level === 'debug');
      expect(debugCalls.length).toBeGreaterThan(0);

      const serializedContexts = JSON.stringify(
        debugCalls.map((c) => c.context),
      );
      // Fixture montos used in allBucketRows() must never leak — only counts.
      expect(serializedContexts).not.toContain('1500000');
      expect(serializedContexts).not.toContain('750000');
      expect(serializedContexts).not.toContain('360000');
      expect(serializedContexts).not.toContain('300000');
      expect(serializedContexts).not.toContain('@');
    });
  });
});

describe('CalcularResumenMesUseCase — budget profile goals (#110)', () => {
  it("measures the month against the requesting user's profile goals", async () => {
    const obtener = vi
      .fn()
      .mockResolvedValue(PerfilPresupuesto.predefinido('80_10_10'));
    const uc = new CalcularResumenMesUseCase(
      makeMockReader(allBucketRows()),
      makeUltimoPeriodoReader(),
      new NoOpLogger(),
      { obtener },
    );

    const result = await uc.execute({ userId: 'user-a', periodo: '2026-07' });

    expect(obtener).toHaveBeenCalledWith('user-a');
    const { resumen } = result.getValue();
    expect(resumen.buckets.map((b) => b.metaBp)).toEqual([8000n, 1000n, 1000n]);
  });
});

describe('CalcularResumenMesUseCase — mes financiero (#111)', () => {
  it('el día de corte del perfil define el período que llega al reader', async () => {
    const reader = makeMockReader(allBucketRows());
    const uc = new CalcularResumenMesUseCase(
      reader,
      makeUltimoPeriodoReader(),
      new NoOpLogger(),
      perfilReaderConCorte(25),
    );

    const result = await uc.execute({ userId: 'user-a', periodo: '2026-10' });

    const periodo = vi.mocked(reader.sumarPorBucket).mock.calls[0][1];
    expect(periodo.diaCorte.valor).toBe(25);
    expect(result.getValue().periodoMes.fechaInicio).toBe('2026-10-25');
    expect(result.getValue().periodoMes.fechaFin).toBe('2026-11-24');
  });
});

describe('CalcularResumenMesUseCase — declared income (#111, rule 1, VIS-10)', () => {
  const rows = allBucketRows({
    [Bucket.Ingreso]: { abono: 1_000_000n },
    [Bucket.Necesidades]: { cargo: 500_000n },
  });

  it('percentages use the declared income and the result says so', async () => {
    const uc = new CalcularResumenMesUseCase(
      makeMockReader(rows),
      makeUltimoPeriodoReader(),
      new NoOpLogger(),
      perfilReaderConCorte(1, 2_000_000n),
    );

    const { resumen } = (
      await uc.execute({ userId: 'user-a', periodo: '2026-07' })
    ).getValue();

    expect(resumen.totalIngreso).toBe(2_000_000n);
    expect(resumen.ingresoDetectado).toBe(1_000_000n);
    expect(resumen.fuenteIngreso).toBe('declarado');
    expect(resumen.buckets[0].porcentajeBp).toBe(2500n);
  });

  it('without a declared income it uses the detected sum (previous behavior)', async () => {
    const uc = new CalcularResumenMesUseCase(
      makeMockReader(rows),
      makeUltimoPeriodoReader(),
      new NoOpLogger(),
      perfilReaderConCorte(1, null),
    );

    const { resumen } = (
      await uc.execute({ userId: 'user-a', periodo: '2026-07' })
    ).getValue();

    expect(resumen.totalIngreso).toBe(1_000_000n);
    expect(resumen.ingresoDetectado).toBe(1_000_000n);
    expect(resumen.fuenteIngreso).toBe('detectado');
    expect(resumen.buckets[0].porcentajeBp).toBe(5000n);
  });
});
