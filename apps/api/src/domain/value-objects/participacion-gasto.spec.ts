import { participacionDelGasto } from './participacion-gasto';

const suma = (xs: ReadonlyArray<bigint | null>): bigint =>
  xs.reduce<bigint>((acc, x) => acc + (x ?? 0n), 0n);

describe('participacionDelGasto', () => {
  it('splits exactly when the shares are whole basis points', () => {
    expect(participacionDelGasto([500n, 300n, 200n])).toEqual([
      5000n,
      3000n,
      2000n,
    ]);
  });

  it('1/3 each: the leftover basis point goes to the first bucket (tie → lowest index)', () => {
    expect(participacionDelGasto([1n, 1n, 1n])).toEqual([3334n, 3333n, 3333n]);
  });

  it('largest remainder wins over position', () => {
    // exact shares: 3333.33.., 3333.33.., 3333.33.. with totals 1,1,1 tie;
    // here 2/3,1/6,1/6 → 6666.67, 1666.67, 1666.67 → floors 6666,1666,1666
    // (sum 9998) → 2 leftover to the two largest remainders (.67 each; the
    // first bucket's .67 and the second's .67 tie with the third's → index order)
    expect(participacionDelGasto([4n, 1n, 1n])).toEqual([6667n, 1667n, 1666n]);
  });

  it('a remainder bigger than an earlier one takes the leftover first', () => {
    // totals 1,2 of 3 → 3333.33 / 6666.67 → floors 3333/6666, one leftover
    // goes to the larger remainder (second bucket), not the first.
    expect(participacionDelGasto([1n, 2n])).toEqual([3333n, 6667n]);
  });

  it('one bucket with all the spend → 10000 / 0 / 0', () => {
    expect(participacionDelGasto([777n, 0n, 0n])).toEqual([10000n, 0n, 0n]);
    expect(participacionDelGasto([0n, 0n, 5n])).toEqual([0n, 0n, 10000n]);
  });

  it('a zero-total bucket among others gets 0 and never receives a leftover', () => {
    const r = participacionDelGasto([1n, 0n, 2n]);
    expect(r).toEqual([3333n, 0n, 6667n]);
  });

  it('stays exact beyond Number.MAX_SAFE_INTEGER pesos', () => {
    const grande = 10n ** 30n;
    expect(participacionDelGasto([grande, grande, grande])).toEqual([
      3334n,
      3333n,
      3333n,
    ]);
    const r = participacionDelGasto([
      9007199254740993n * 10n ** 6n,
      9007199254740993n,
      1n,
    ]);
    expect(suma(r)).toBe(10000n);
  });

  it('returns null for every bucket when total spend is 0', () => {
    expect(participacionDelGasto([0n, 0n, 0n])).toEqual([null, null, null]);
  });

  it('returns null for every bucket on an empty or negative input (never produces shares)', () => {
    expect(participacionDelGasto([])).toEqual([]);
    expect(participacionDelGasto([-5n, 10n, 0n])).toEqual([null, null, null]);
  });

  it('property: with spend, values are integers in 0..10000 and sum to exactly 10000', () => {
    // deterministic LCG so a failure is reproducible
    let seed = 123456789n;
    const sig = (): bigint => {
      seed = (seed * 6364136223846793005n + 1442695040888963407n) % 2n ** 64n;
      return seed;
    };
    for (let i = 0; i < 2000; i++) {
      const n = Number(sig() % 5n) + 1;
      const totales = Array.from({ length: n }, () => {
        const magnitud = sig() % 40n;
        const base = sig() % 10n ** ((magnitud % 25n) + 1n);
        return sig() % 4n === 0n ? 0n : base;
      });
      const r = participacionDelGasto(totales);
      const total = totales.reduce((a, b) => a + b, 0n);
      if (total === 0n) {
        expect(r.every((x) => x === null)).toBe(true);
        continue;
      }
      expect(suma(r)).toBe(10000n);
      r.forEach((x, idx) => {
        expect(x).not.toBeNull();
        expect(x! >= 0n && x! <= 10000n).toBe(true);
        if (totales[idx] === 0n) expect(x).toBe(0n);
        // within 1 bp of the exact share
        const exactoX = totales[idx] * 10000n;
        const diff = x! * total - exactoX;
        expect(diff > -total && diff < total).toBe(true);
      });
    }
  });
});
