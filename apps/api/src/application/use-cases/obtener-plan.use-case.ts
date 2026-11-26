import type { IPlanReader } from '../ports/plan-reader.port';
import type { IReloj } from '../ports/reloj.port';
import {
  resolverPlanCuenta,
  type PlanCuenta,
  type ReglaPrueba,
} from '../../domain/value-objects/plan';

export interface ObtenerPlanQuery {
  readonly userId: string;
}

/**
 * ObtenerPlanUseCase — respalda `GET /api/plan` (ADR-012 §2, ADR-015 §2). El
 * API decide si la cuenta tiene Plus, prueba incluida (ADR-015 §3); la app solo
 * lo muestra (ADR-001).
 */
export class ObtenerPlanUseCase {
  constructor(
    private readonly planes: IPlanReader,
    private readonly reloj: IReloj,
    private readonly reglaPrueba: ReglaPrueba,
  ) {}

  async execute(query: ObtenerPlanQuery): Promise<PlanCuenta> {
    const cuenta = await this.planes.leer(query.userId);

    return resolverPlanCuenta(cuenta, this.reglaPrueba, this.reloj.ahora());
  }
}
