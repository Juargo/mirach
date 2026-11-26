import type { IPlanReader } from '../ports/plan-reader.port';
import type { IReloj } from '../ports/reloj.port';
import {
  cuposFundador,
  resolverPlanCuenta,
  type CuposFundador,
  type PlanCuenta,
  type ReglaPrueba,
} from '../../domain/value-objects/plan';

export interface PlanDto extends PlanCuenta {
  /** `null` cuando el plan Fundador no está en venta. */
  readonly fundador: CuposFundador | null;
}

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
    /** Cupos del plan Fundador; `null` cuando no está en venta. */
    private readonly cuposFundadorTotales: number | null,
  ) {}

  async execute(query: ObtenerPlanQuery): Promise<PlanDto> {
    const cuenta = await this.planes.leer(query.userId);
    const fundador =
      this.cuposFundadorTotales === null
        ? null
        : cuposFundador(
            this.cuposFundadorTotales,
            await this.planes.contarFundadoresVendidos(),
          );

    return {
      ...resolverPlanCuenta(cuenta, this.reglaPrueba, this.reloj.ahora()),
      fundador,
    };
  }
}
