import {
  IListarIngestasReader,
  IngestaResumen,
} from '../ports/listar-ingestas.port';

/**
 * ListarIngestasUseCase — use case de lectura para el listado de las
 * ingestas del usuario autenticado (US-018, ING-03).
 *
 * Return-type decision (D4, design.md §4.4): retorna el arreglo
 * DIRECTAMENTE, NO `Result<...>`. No hay falla de dominio que modelar — una
 * lista vacía es un éxito válido, el `userId` viene garantizado por el
 * session middleware (sin validación), y los errores de infra propagan como
 * excepción (mismo canal que EliminarIngestaUseCase, design.md §3.4).
 * Envolver en `Result<IngestaResumen[], never>` sería ceremonia vacía
 * (KISS/YAGNI).
 */
export class ListarIngestasUseCase {
  constructor(private readonly reader: IListarIngestasReader) {}

  execute(userId: string): Promise<IngestaResumen[]> {
    return this.reader.listarPorUsuario(userId);
  }
}
