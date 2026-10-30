import { IPeriodosConDatosReader } from '../ports/periodos-con-datos.port';
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import { IPerfilPresupuestoReader } from '../ports/perfil-presupuesto.port';

export interface ListarPeriodosConDatosInput {
  readonly userId: string;
}

/**
 * ListarPeriodosConDatosUseCase — financial months (`YYYY-MM` with their
 * dates, #111) in which the session user has at least one movement; feeds the month selector of Resumen,
 * Detalle de bucket and Ingresos del mes.
 *
 * Contract owned here (not by the reader): MOST RECENT FIRST, no duplicates.
 * `YYYY-MM` is zero-padded, so descending lexicographic order is
 * chronological order. Empty list when the user has no movements. Never
 * fails — "no data" is a valid state, not an error.
 */
export class ListarPeriodosConDatosUseCase {
  constructor(
    private readonly reader: IPeriodosConDatosReader,
    private readonly perfilReader: IPerfilPresupuestoReader,
  ) {}

  async execute(
    input: ListarPeriodosConDatosInput,
  ): Promise<ReadonlyArray<PeriodoMes>> {
    // Labeled with the user's cut-off day (#111), like every monthly read.
    const perfil = await this.perfilReader.obtener(input.userId);
    const periodos = await this.reader.periodosConDatos(
      input.userId,
      perfil.mesFinanciero.diaCorte,
    );
    const unicos = new Map(periodos.map((periodo) => [periodo.valor, periodo]));
    return [...unicos.values()].sort((a, b) =>
      a.valor < b.valor ? 1 : a.valor > b.valor ? -1 : 0,
    );
  }
}
