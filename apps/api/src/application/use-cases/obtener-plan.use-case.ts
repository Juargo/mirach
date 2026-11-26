import type { IPlanReader } from '../ports/plan-reader.port';
import type { IReloj } from '../ports/reloj.port';
import {
  resolverPlanEfectivo,
  type PlanEfectivo,
} from '../../domain/value-objects/plan';

export interface ObtenerPlanQuery {
  readonly userId: string;
}

/**
 * ObtenerPlanUseCase — respalda `GET /api/plan` (ADR-012 §2, ADR-015 §2). El
 * API decide si la cuenta tiene Plus; la app solo lo muestra (ADR-001).
 */
export class ObtenerPlanUseCase {
  constructor(
    private readonly planes: IPlanReader,
    private readonly reloj: IReloj,
  ) {}

  async execute(query: ObtenerPlanQuery): Promise<PlanEfectivo> {
    const { suscripcion, permisos } = await this.planes.leer(query.userId);

    return resolverPlanEfectivo(suscripcion, permisos, this.reloj.ahora());
  }
}
