// ──────────────────────────────────────────────────────────────────────────────
// participacionDelGasto — share of each spend bucket in the month's TOTAL SPEND.
// Money-critical (ADR-015): exact BigInt arithmetic, no float, no Math.*.
// ──────────────────────────────────────────────────────────────────────────────

const BASIS_POINTS_TOTAL = 10000n;

/**
 * Splits 10000 basis points among the given spend totals, proportionally to
 * each total, using the largest-remainder (Hamilton) method:
 *
 *   1. floor_i = floor(total_i * 10000 / sum)
 *   2. leftover = 10000 - sum(floor_i)  (always < number of buckets)
 *   3. each of the `leftover` buckets with the largest remainder
 *      (total_i * 10000 mod sum) receives one extra basis point.
 *
 * Tie-break (deterministic): equal remainders favor the LOWER index, i.e. the
 * earlier bucket in the input order. A bucket with total 0 has remainder 0 and
 * can therefore never receive a leftover while any positive-total bucket
 * exists (the leftover count never exceeds the number of non-zero remainders).
 *
 * Returns one entry per input, in the same order:
 *   - with spend (sum > 0): integers in 0..10000 summing to exactly 10000.
 *   - without spend (sum === 0), or if any total is negative (not a valid
 *     spend total): null for every entry — there is no share to report.
 *
 * Differs from `porcentajeBasisPoints`, whose base is the month's income and
 * which rounds each bucket independently (its values need not sum to 10000).
 *
 * Pure; never throws (no failure mode: invalid input maps to null, not an
 * error, so there is no Result).
 */
export function participacionDelGasto(
  totales: ReadonlyArray<bigint>,
): ReadonlyArray<bigint | null> {
  const suma = totales.reduce((acc, t) => acc + t, 0n);
  if (suma <= 0n || totales.some((t) => t < 0n)) {
    return totales.map(() => null);
  }

  const bases = totales.map((t) => (t * BASIS_POINTS_TOTAL) / suma);
  const restos = totales.map((t) => (t * BASIS_POINTS_TOTAL) % suma);
  const pendientes = Number(
    BASIS_POINTS_TOTAL - bases.reduce((acc, b) => acc + b, 0n),
  );

  const porResto = totales
    .map((_, indice) => indice)
    .sort((a, b) => {
      const ra = restos[a];
      const rb = restos[b];
      if (ra !== rb) return ra > rb ? -1 : 1;
      return a - b;
    });

  const resultado = [...bases];
  for (const indice of porResto.slice(0, pendientes)) {
    resultado[indice] = resultado[indice] + 1n;
  }
  return resultado;
}
