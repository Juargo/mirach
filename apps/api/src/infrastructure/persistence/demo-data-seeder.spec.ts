import { seedDemoTransacciones } from './demo-data-seeder';
import { DEMO_TRANSACCIONES, ID_BUCKET_SINCATEGORIA_LEGACY } from './demo-data';
import { BUCKET_IDS } from './bucket-ids';
import { Bucket } from '../../domain/value-objects/bucket';
import { ICryptoService } from '../../application/ports/crypto-service.port';

const ACCOUNT_ID = 'account-demo-1';
const INGESTA_ID = 'ingesta-demo-1';
const AHORA = new Date('2026-07-18T12:00:00.000Z');

/** Mock determinístico — mismo estilo que prisma-demo.repository.spec.ts. */
const CRYPTO: ICryptoService = {
  encrypt: (v: string) => `cifrado:${v}`,
  decrypt: (v: string) => v,
};

describe('DEMO_TRANSACCIONES (demo-data.ts) — DEMO-DATA-01/02/03', () => {
  it('tiene entre 25 y 35 transacciones (DEMO-DATA-01)', () => {
    expect(DEMO_TRANSACCIONES.length).toBeGreaterThanOrEqual(25);
    expect(DEMO_TRANSACCIONES.length).toBeLessThanOrEqual(35);
  });

  it('cubre los 4 buckets del dominio, más el bucket físico legacy, con al menos 1 transacción cada uno (DEMO-DATA-01)', () => {
    const bucketsCubiertos = new Set(
      DEMO_TRANSACCIONES.map((def) => def.bucketKey),
    );

    for (const bucket of Object.values(Bucket)) {
      expect(bucketsCubiertos.has(bucket)).toBe(true);
    }
    // issue #778 tramo 5b PR5: SinCategoria left the domain, but demo-data.ts
    // keeps its 2 legacy-bucket rows untouched (out of scope — PR 6 removes
    // them). This bucket is still expected to appear here.
    expect(bucketsCubiertos.has(ID_BUCKET_SINCATEGORIA_LEGACY)).toBe(true);
  });

  it('incluye exactamente 1 transacción de ingreso (abono) ~$1.200.000 (DEMO-DATA-02)', () => {
    const ingresos = DEMO_TRANSACCIONES.filter(
      (def) => def.bucketKey === Bucket.Ingreso,
    );

    expect(ingresos).toHaveLength(1);
    expect(ingresos[0].abono).toBe(1_200_000n);
    expect(ingresos[0].cargo).toBe(0n);
  });

  it('ninguna transacción tiene cargo o abono cero-y-cero, ni montos negativos (DEMO-DATA-03)', () => {
    for (const def of DEMO_TRANSACCIONES) {
      expect(def.cargo >= 0n).toBe(true);
      expect(def.abono >= 0n).toBe(true);
      expect(def.cargo > 0n || def.abono > 0n).toBe(true);
      expect(def.cargo).toBeLessThanOrEqual(5_000_000n);
      expect(def.abono).toBeLessThanOrEqual(10_000_000n);
    }
  });

  it('Necesidades cae entre 55% y 65% del total de gastos (DEMO-DATA-02)', () => {
    const { necesidades, totalGastos } = totalesPorBucket();
    const porcentaje = Number(necesidades) / Number(totalGastos);

    expect(porcentaje).toBeGreaterThanOrEqual(0.55);
    expect(porcentaje).toBeLessThanOrEqual(0.65);
  });

  it('Deseos cae entre 15% y 25% del total de gastos (DEMO-DATA-02)', () => {
    const { deseos, totalGastos } = totalesPorBucket();
    const porcentaje = Number(deseos) / Number(totalGastos);

    expect(porcentaje).toBeGreaterThanOrEqual(0.15);
    expect(porcentaje).toBeLessThanOrEqual(0.25);
  });

  it('Ahorro cae entre 5% y 15% del total de gastos, con la transferencia ~$120K (DEMO-DATA-02)', () => {
    const { ahorro, totalGastos } = totalesPorBucket();
    const porcentaje = Number(ahorro) / Number(totalGastos);

    expect(porcentaje).toBeGreaterThanOrEqual(0.05);
    expect(porcentaje).toBeLessThanOrEqual(0.15);
    expect(
      DEMO_TRANSACCIONES.some(
        (def) =>
          def.bucketKey === Bucket.Ahorro &&
          def.descripcion === 'Transferencia a cuenta de ahorro',
      ),
    ).toBe(true);
  });

  function totalesPorBucket() {
    // `Record<string, bigint>` (not `Record<Bucket, bigint>`): issue #778
    // tramo 5b PR5 removed `Bucket.SinCategoria`, but demo-data.ts's 2
    // legacy-bucket rows are untouched (out of scope, PR 6 removes them) —
    // this helper keeps summing them under their raw physical id so the
    // DEMO-DATA-02 percentage assertions below see the SAME totalGastos as
    // before this PR (no behavior change, only a typing fix).
    const sums: Record<string, bigint> = {
      [Bucket.Necesidades]: 0n,
      [Bucket.Deseos]: 0n,
      [Bucket.Ahorro]: 0n,
      [Bucket.Ingreso]: 0n,
      [ID_BUCKET_SINCATEGORIA_LEGACY]: 0n,
    };

    for (const def of DEMO_TRANSACCIONES) {
      sums[def.bucketKey] += def.cargo;
    }

    const totalGastos =
      sums[Bucket.Necesidades] +
      sums[Bucket.Deseos] +
      sums[Bucket.Ahorro] +
      sums[ID_BUCKET_SINCATEGORIA_LEGACY];

    return {
      necesidades: sums[Bucket.Necesidades],
      deseos: sums[Bucket.Deseos],
      ahorro: sums[Bucket.Ahorro],
      totalGastos,
    };
  }
});

describe('seedDemoTransacciones()', () => {
  it('mapea cada definición a un TransaccionCreateManyInput con bucketId resuelto vía BUCKET_IDS (DEMO-DATA-05)', () => {
    const rows = seedDemoTransacciones(
      DEMO_TRANSACCIONES,
      BUCKET_IDS,
      ACCOUNT_ID,
      INGESTA_ID,
      AHORA,
      CRYPTO,
    );

    expect(rows).toHaveLength(DEMO_TRANSACCIONES.length);

    rows.forEach((row, i) => {
      const def = DEMO_TRANSACCIONES[i];
      expect(row.accountId).toBe(ACCOUNT_ID);
      expect(row.ingestaId).toBe(INGESTA_ID);
      expect(row.cargo).toBe(def.cargo);
      expect(row.abono).toBe(def.abono);
      // `def.bucketKey` may be the legacy literal `ID_BUCKET_SINCATEGORIA_LEGACY`
      // (issue #778 tramo 5b PR5), which is NOT a key of `BUCKET_IDS` —
      // `seedDemoTransacciones` resolves it to itself verbatim (see its
      // `resolverBucketIdDemo` helper).
      const idEsperado =
        def.bucketKey === ID_BUCKET_SINCATEGORIA_LEGACY
          ? ID_BUCKET_SINCATEGORIA_LEGACY
          : BUCKET_IDS[def.bucketKey];
      expect(row.bucketId).toBe(idEsperado);
    });
  });

  it('cifra la descripcion vía el ICryptoService — nunca la persiste en claro (#204)', () => {
    const rows = seedDemoTransacciones(
      DEMO_TRANSACCIONES,
      BUCKET_IDS,
      ACCOUNT_ID,
      INGESTA_ID,
      AHORA,
      CRYPTO,
    );

    rows.forEach((row, i) => {
      const def = DEMO_TRANSACCIONES[i];
      expect(row.descripcion).toBe(`cifrado:${def.descripcion}`);
      expect(row.descripcion).not.toBe(def.descripcion);
    });
  });

  it('resuelve daysAgo a una fecha absoluta relativa a `ahora`', () => {
    const defs = [
      {
        descripcion: 'x',
        cargo: 1_000n,
        abono: 0n,
        bucketKey: Bucket.Necesidades,
        daysAgo: 5,
      },
    ];

    const [row] = seedDemoTransacciones(
      defs,
      BUCKET_IDS,
      ACCOUNT_ID,
      INGESTA_ID,
      AHORA,
      CRYPTO,
    );

    expect((row.fecha as Date).getTime()).toBe(
      AHORA.getTime() - 5 * 24 * 60 * 60 * 1000,
    );
  });

  it('todos los bucketId resueltos son valores conocidos de BUCKET_IDS o el legacy ID_BUCKET_SINCATEGORIA_LEGACY', () => {
    const rows = seedDemoTransacciones(
      DEMO_TRANSACCIONES,
      BUCKET_IDS,
      ACCOUNT_ID,
      INGESTA_ID,
      AHORA,
      CRYPTO,
    );
    // issue #778 tramo 5b PR5: `Bucket.SinCategoria` no longer exists, so
    // `BUCKET_IDS` alone doesn't cover the 2 legacy demo rows — PR 6 (#778)
    // removes them along with `ID_BUCKET_SINCATEGORIA_LEGACY` itself.
    const idsValidos = new Set([
      ...Object.values(BUCKET_IDS),
      ID_BUCKET_SINCATEGORIA_LEGACY,
    ]);

    for (const row of rows) {
      expect(idsValidos.has(row.bucketId as string)).toBe(true);
    }
  });
});
