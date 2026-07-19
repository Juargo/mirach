import { Bucket } from '../src/domain/value-objects/bucket';

/**
 * DemoTransaccionDef — definición estática de una transacción demo.
 *
 * `cargo`/`abono` son `bigint` (dinero exacto, nunca float — CLAUDE.md). Solo
 * uno de los dos es distinto de cero por fila, igual que `Transaccion` real.
 * `daysAgo` se resuelve a una fecha absoluta en el seeder, relativa al
 * instante de creación del usuario demo (`ahora`).
 */
export interface DemoTransaccionDef {
  readonly descripcion: string;
  readonly cargo: bigint;
  readonly abono: bigint;
  readonly bucketKey: Bucket;
  readonly daysAgo: number;
}

/**
 * DEMO_TRANSACCIONES — un mes típico de finanzas de un profesional chileno
 * (demo-data.md DEMO-DATA-01/02/03). 26 transacciones, cubre los 5 buckets,
 * distribución realista 50/30/20 sobre el total de gastos (excluyendo el
 * ingreso):
 *
 *   Necesidades ~898.000 (63,0% de 1.426.000 en gastos) — dentro de 55–65%
 *   Deseos      ~310.000 (21,7%)                        — dentro de 15–25%
 *   Ahorro      ~160.000 (11,2%)                        — dentro de 5–15%
 *   SinCategoria ~58.000 (resto, sin bound explícito)
 *
 * Ningún monto es cero/negativo; todos ≤ los topes de DEMO-DATA-03
 * (cargo ≤ $5.000.000, abono ≤ $10.000.000).
 */
export const DEMO_TRANSACCIONES: readonly DemoTransaccionDef[] = [
  // Ingreso (1 transacción, ~$1.200.000 — DEMO-DATA-02 "Income allocation")
  {
    descripcion: 'Sueldo',
    cargo: 0n,
    abono: 1_200_000n,
    bucketKey: Bucket.Ingreso,
    daysAgo: 1,
  },

  // Necesidades (11 transacciones, $898.000 — incluye vivienda: no existe un
  // bucket "Vivienda" separado en el dominio actual, ver bucket.ts; arriendo
  // y servicios del hogar se registran bajo Necesidades).
  { descripcion: 'Arriendo', cargo: 400_000n, abono: 0n, bucketKey: Bucket.Necesidades, daysAgo: 3 },
  { descripcion: 'Isapre', cargo: 90_000n, abono: 0n, bucketKey: Bucket.Necesidades, daysAgo: 5 },
  { descripcion: 'Gastos comunes', cargo: 50_000n, abono: 0n, bucketKey: Bucket.Necesidades, daysAgo: 5 },
  { descripcion: 'Supermercado Líder', cargo: 120_000n, abono: 0n, bucketKey: Bucket.Necesidades, daysAgo: 8 },
  { descripcion: 'Supermercado Jumbo', cargo: 80_000n, abono: 0n, bucketKey: Bucket.Necesidades, daysAgo: 20 },
  { descripcion: 'Bencina Copec', cargo: 30_000n, abono: 0n, bucketKey: Bucket.Necesidades, daysAgo: 10 },
  { descripcion: 'Bencina Shell', cargo: 30_000n, abono: 0n, bucketKey: Bucket.Necesidades, daysAgo: 25 },
  { descripcion: 'Agua', cargo: 15_000n, abono: 0n, bucketKey: Bucket.Necesidades, daysAgo: 6 },
  { descripcion: 'Luz', cargo: 35_000n, abono: 0n, bucketKey: Bucket.Necesidades, daysAgo: 6 },
  { descripcion: 'Internet', cargo: 30_000n, abono: 0n, bucketKey: Bucket.Necesidades, daysAgo: 6 },
  { descripcion: 'Farmacia Cruz Verde', cargo: 18_000n, abono: 0n, bucketKey: Bucket.Necesidades, daysAgo: 14 },

  // Deseos (9 transacciones, $310.000)
  { descripcion: 'Netflix', cargo: 8_000n, abono: 0n, bucketKey: Bucket.Deseos, daysAgo: 2 },
  { descripcion: 'Spotify', cargo: 6_000n, abono: 0n, bucketKey: Bucket.Deseos, daysAgo: 2 },
  { descripcion: 'Restaurante Sushi Domicilio', cargo: 35_000n, abono: 0n, bucketKey: Bucket.Deseos, daysAgo: 9 },
  { descripcion: 'Restaurante La Vecina', cargo: 45_000n, abono: 0n, bucketKey: Bucket.Deseos, daysAgo: 16 },
  { descripcion: 'Cine Hoyts', cargo: 25_000n, abono: 0n, bucketKey: Bucket.Deseos, daysAgo: 12 },
  { descripcion: 'Rappi', cargo: 40_000n, abono: 0n, bucketKey: Bucket.Deseos, daysAgo: 18 },
  { descripcion: 'Uber Eats', cargo: 35_000n, abono: 0n, bucketKey: Bucket.Deseos, daysAgo: 22 },
  { descripcion: 'Ropa H&M', cargo: 96_000n, abono: 0n, bucketKey: Bucket.Deseos, daysAgo: 11 },
  { descripcion: 'Compras Falabella', cargo: 20_000n, abono: 0n, bucketKey: Bucket.Deseos, daysAgo: 27 },

  // Ahorro (3 transacciones, $160.000 — incluye la transferencia ~$120K exigida)
  {
    descripcion: 'Transferencia a cuenta de ahorro',
    cargo: 120_000n,
    abono: 0n,
    bucketKey: Bucket.Ahorro,
    daysAgo: 4,
  },
  { descripcion: 'Depósito a plazo', cargo: 30_000n, abono: 0n, bucketKey: Bucket.Ahorro, daysAgo: 17 },
  { descripcion: 'Ahorro extra fin de mes', cargo: 10_000n, abono: 0n, bucketKey: Bucket.Ahorro, daysAgo: 28 },

  // SinCategoria (2 transacciones, $58.000 — cobertura del bucket, DEMO-DATA-01)
  { descripcion: 'Retiro Cajero Automático', cargo: 50_000n, abono: 0n, bucketKey: Bucket.SinCategoria, daysAgo: 7 },
  { descripcion: 'Transferencia sin glosa', cargo: 8_000n, abono: 0n, bucketKey: Bucket.SinCategoria, daysAgo: 19 },
];
