import { seedDemoTransacciones } from './demo-data-seeder';
import { DEMO_TRANSACCIONES } from '../../../prisma/demo-data';
import { BUCKET_IDS } from './bucket-ids';
import { Bucket } from '../../domain/value-objects/bucket';

const ACCOUNT_ID = 'account-demo-1';
const INGESTA_ID = 'ingesta-demo-1';
const AHORA = new Date('2026-07-18T12:00:00.000Z');

describe('DEMO_TRANSACCIONES (demo-data.ts) — DEMO-DATA-01/02/03', () => {
  it('tiene entre 25 y 35 transacciones (DEMO-DATA-01)', () => {
    expect(DEMO_TRANSACCIONES.length).toBeGreaterThanOrEqual(25);
    expect(DEMO_TRANSACCIONES.length).toBeLessThanOrEqual(35);
  });

  it('cubre los 5 buckets existentes con al menos 1 transacción cada uno (DEMO-DATA-01)', () => {
    const bucketsCubiertos = new Set(
      DEMO_TRANSACCIONES.map((def) => def.bucketKey),
    );

    for (const bucket of Object.values(Bucket)) {
      expect(bucketsCubiertos.has(bucket)).toBe(true);
    }
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
    const sums: Record<Bucket, bigint> = {
      [Bucket.Necesidades]: 0n,
      [Bucket.Deseos]: 0n,
      [Bucket.Ahorro]: 0n,
      [Bucket.Ingreso]: 0n,
      [Bucket.SinCategoria]: 0n,
    };

    for (const def of DEMO_TRANSACCIONES) {
      sums[def.bucketKey] += def.cargo;
    }

    const totalGastos =
      sums[Bucket.Necesidades] +
      sums[Bucket.Deseos] +
      sums[Bucket.Ahorro] +
      sums[Bucket.SinCategoria];

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
    );

    expect(rows).toHaveLength(DEMO_TRANSACCIONES.length);

    rows.forEach((row, i) => {
      const def = DEMO_TRANSACCIONES[i];
      expect(row.accountId).toBe(ACCOUNT_ID);
      expect(row.ingestaId).toBe(INGESTA_ID);
      expect(row.descripcion).toBe(def.descripcion);
      expect(row.cargo).toBe(def.cargo);
      expect(row.abono).toBe(def.abono);
      expect(row.bucketId).toBe(BUCKET_IDS[def.bucketKey]);
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
    );

    expect((row.fecha as Date).getTime()).toBe(
      AHORA.getTime() - 5 * 24 * 60 * 60 * 1000,
    );
  });

  it('todos los bucketId resueltos son valores conocidos de BUCKET_IDS', () => {
    const rows = seedDemoTransacciones(
      DEMO_TRANSACCIONES,
      BUCKET_IDS,
      ACCOUNT_ID,
      INGESTA_ID,
      AHORA,
    );
    const idsValidos = new Set(Object.values(BUCKET_IDS));

    for (const row of rows) {
      expect(idsValidos.has(row.bucketId as string)).toBe(true);
    }
  });
});
