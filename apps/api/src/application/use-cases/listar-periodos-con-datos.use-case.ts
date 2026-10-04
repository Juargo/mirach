import { IPeriodosConDatosReader } from '../ports/periodos-con-datos.port';

export interface ListarPeriodosConDatosInput {
  readonly userId: string;
}

/**
 * ListarPeriodosConDatosUseCase — months (`YYYY-MM`) in which the session
 * user has at least one movement; feeds the month selector of Resumen,
 * Detalle de bucket and Ingresos del mes.
 *
 * Contract owned here (not by the reader): MOST RECENT FIRST, no duplicates.
 * `YYYY-MM` is zero-padded, so descending lexicographic order is
 * chronological order. Empty list when the user has no movements. Never
 * fails — "no data" is a valid state, not an error.
 */
export class ListarPeriodosConDatosUseCase {
  constructor(private readonly reader: IPeriodosConDatosReader) {}

  async execute(
    input: ListarPeriodosConDatosInput,
  ): Promise<ReadonlyArray<string>> {
    const periodos = await this.reader.periodosConDatos(input.userId);
    const unicos = new Set(periodos.map((periodo) => periodo.valor));
    return [...unicos].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  }
}
