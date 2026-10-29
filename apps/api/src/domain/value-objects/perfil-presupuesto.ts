import { Bucket } from './bucket';
import { Result } from '../../shared/result';
import { PerfilNoSuma100Error } from '../errors/perfil-no-suma-100.error';
import { MetaPresupuestoInvalidaError } from '../errors/meta-presupuesto-invalida.error';

// ──────────────────────────────────────────────────────────────────────────────
// Issue #110: PerfilPresupuesto — the user's budget profile (PER-03..PER-06,
// ADR-004 §8). Three goals in integer basis points that sum 10000.
// Money-adjacent (ADR-010): bigint only, no float / Math.* / Number.
// ──────────────────────────────────────────────────────────────────────────────

/** Goals per spend block, in basis points (5000 = 50 %). */
export type MetasPresupuesto = Readonly<
  Record<Bucket.Necesidades | Bucket.Deseos | Bucket.Ahorro, bigint>
>;

const metas = (
  necesidades: bigint,
  deseos: bigint,
  ahorro: bigint,
): MetasPresupuesto =>
  Object.freeze({
    [Bucket.Necesidades]: necesidades,
    [Bucket.Deseos]: deseos,
    [Bucket.Ahorro]: ahorro,
  });

/**
 * The four predefined profiles (PER-03). 80_10_10 is shown as «Salir de
 * deudas» (PER-04); there is no fifth profile.
 */
export const PERFILES_PREDEFINIDOS = Object.freeze({
  '50_30_20': metas(5000n, 3000n, 2000n),
  '60_20_20': metas(6000n, 2000n, 2000n),
  '70_15_15': metas(7000n, 1500n, 1500n),
  '80_10_10': metas(8000n, 1000n, 1000n),
});

export type PerfilPredefinidoId = keyof typeof PERFILES_PREDEFINIDOS;
export const PERFIL_PERSONALIZADO = 'personalizado';
export type PerfilPresupuestoId =
  PerfilPredefinidoId | typeof PERFIL_PERSONALIZADO;

/** Goals of the default profile, for users who never chose one. */
export const METAS_POR_DEFECTO: MetasPresupuesto =
  PERFILES_PREDEFINIDOS['50_30_20'];

const TOTAL_BP = 10000n;

function esPredefinido(id: string): id is PerfilPredefinidoId {
  return Object.prototype.hasOwnProperty.call(PERFILES_PREDEFINIDOS, id);
}

function mismasMetas(a: MetasPresupuesto, b: MetasPresupuesto): boolean {
  return (
    a[Bucket.Necesidades] === b[Bucket.Necesidades] &&
    a[Bucket.Deseos] === b[Bucket.Deseos] &&
    a[Bucket.Ahorro] === b[Bucket.Ahorro]
  );
}

export class PerfilPresupuesto {
  private constructor(
    readonly perfil: PerfilPresupuestoId,
    readonly metas: MetasPresupuesto,
  ) {}

  static predefinido(id: PerfilPredefinidoId): PerfilPresupuesto {
    return new PerfilPresupuesto(id, PERFILES_PREDEFINIDOS[id]);
  }

  static porDefecto(): PerfilPresupuesto {
    return PerfilPresupuesto.predefinido('50_30_20');
  }

  /** Custom profile (PER-05): non-negative goals that sum 10000. */
  static personalizado(
    entrada: MetasPresupuesto,
  ): Result<
    PerfilPresupuesto,
    PerfilNoSuma100Error | MetaPresupuestoInvalidaError
  > {
    const valores = [
      entrada[Bucket.Necesidades],
      entrada[Bucket.Deseos],
      entrada[Bucket.Ahorro],
    ];
    if (valores.some((v) => v < 0n)) {
      return Result.fail(new MetaPresupuestoInvalidaError());
    }
    if (valores.reduce((a, b) => a + b, 0n) !== TOTAL_BP) {
      return Result.fail(new PerfilNoSuma100Error());
    }
    return Result.ok(
      new PerfilPresupuesto(
        PERFIL_PERSONALIZADO,
        metas(valores[0], valores[1], valores[2]),
      ),
    );
  }

  /**
   * Rebuilds a stored profile. A predefined id must carry its own goals; any
   * mismatch or unknown id is a data-integrity failure.
   */
  static desdePersistencia(
    perfil: string,
    guardadas: MetasPresupuesto,
  ): Result<
    PerfilPresupuesto,
    PerfilNoSuma100Error | MetaPresupuestoInvalidaError
  > {
    if (perfil === PERFIL_PERSONALIZADO) {
      return PerfilPresupuesto.personalizado(guardadas);
    }
    if (
      !esPredefinido(perfil) ||
      !mismasMetas(PERFILES_PREDEFINIDOS[perfil], guardadas)
    ) {
      return Result.fail(new MetaPresupuestoInvalidaError());
    }
    return Result.ok(PerfilPresupuesto.predefinido(perfil));
  }
}
