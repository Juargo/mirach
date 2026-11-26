import type { IPlanReader } from '../ports/plan-reader.port';
import type { IReloj } from '../ports/reloj.port';
import type { IVerificadorPlus } from '../ports/verificador-plus.port';
import { PlanPlusRequeridoError } from '../../domain/errors/plan-plus-requerido.error';
import {
  Plan,
  resolverPlanCuenta,
  type ReglaPrueba,
} from '../../domain/value-objects/plan';
import { Result } from '../../shared/result';

export interface VerificarPlusQuery {
  readonly userId: string;
}

/**
 * VerificarPlusUseCase — la puerta de las funciones de Plus (PLA-01). Usa la
 * misma regla que `GET /api/plan` (`resolverPlanCuenta`), así que lo que la app
 * muestra y lo que el API permite nunca se contradicen. Un fallo al leer no se
 * atrapa: termina en 500 y nunca deja pasar la petición.
 */
export class VerificarPlusUseCase implements IVerificadorPlus {
  constructor(
    private readonly planes: IPlanReader,
    private readonly reloj: IReloj,
    private readonly reglaPrueba: ReglaPrueba,
  ) {}

  async tienePlus(userId: string): Promise<boolean> {
    const cuenta = await this.planes.leer(userId);
    const plan = resolverPlanCuenta(
      cuenta,
      this.reglaPrueba,
      this.reloj.ahora(),
    );

    return plan.plan === Plan.Plus;
  }

  async execute(
    query: VerificarPlusQuery,
  ): Promise<Result<void, PlanPlusRequeridoError>> {
    return (await this.tienePlus(query.userId))
      ? Result.ok(undefined)
      : Result.fail(new PlanPlusRequeridoError());
  }
}
