import { Result } from '../../shared/result';
import { DiaCorteInvalidoError } from '../errors/dia-corte-invalido.error';
import { IngresoDeclaradoInvalidoError } from '../errors/ingreso-declarado-invalido.error';

// ──────────────────────────────────────────────────────────────────────────────
// Issue #111: the user's financial month (PER-08) and declared monthly income
// (PER-02). Both live in the budget profile resource (ADR-005 §7).
// Money-adjacent (ADR-010): the declared income is a bigint in pesos.
// ──────────────────────────────────────────────────────────────────────────────

const DIA_CORTE_MIN = 1;
const DIA_CORTE_MAX = 28;

/** Cut-off day of the financial month: an integer from 1 to 28. */
export class DiaCorte {
  /** Day 1 is the calendar month, the default (PER-08). */
  static readonly CALENDARIO = new DiaCorte(DIA_CORTE_MIN);

  private constructor(readonly valor: number) {}

  static crear(valor: number): Result<DiaCorte, DiaCorteInvalidoError> {
    if (
      !Number.isInteger(valor) ||
      valor < DIA_CORTE_MIN ||
      valor > DIA_CORTE_MAX
    ) {
      return Result.fail(new DiaCorteInvalidoError());
    }
    return Result.ok(
      valor === DIA_CORTE_MIN ? DiaCorte.CALENDARIO : new DiaCorte(valor),
    );
  }

  get esCalendario(): boolean {
    return this.valor === DIA_CORTE_MIN;
  }
}

/** Cut-off day plus the optional declared monthly income, in pesos. */
export class MesFinanciero {
  private constructor(
    readonly diaCorte: DiaCorte,
    readonly ingresoDeclarado: bigint | null,
  ) {}

  static porDefecto(): MesFinanciero {
    return new MesFinanciero(DiaCorte.CALENDARIO, null);
  }

  static crear(
    diaCorte: number,
    ingresoDeclarado: bigint | null,
  ): Result<
    MesFinanciero,
    DiaCorteInvalidoError | IngresoDeclaradoInvalidoError
  > {
    const dia = DiaCorte.crear(diaCorte);
    if (dia.isFail()) return Result.fail(dia.getError());
    if (ingresoDeclarado !== null && ingresoDeclarado <= 0n) {
      return Result.fail(new IngresoDeclaradoInvalidoError());
    }
    return Result.ok(new MesFinanciero(dia.getValue(), ingresoDeclarado));
  }
}
