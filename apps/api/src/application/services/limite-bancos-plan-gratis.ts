import { PlanPlusRequeridoError } from '../../domain/errors/plan-plus-requerido.error';
import { Result } from '../../shared/result';
import type { IBancosImportadosReader } from '../ports/bancos-importados-reader.port';
import type { IVerificadorPlus } from '../ports/verificador-plus.port';

/** Lo que la importación necesita del límite de bancos. */
export interface ILimiteBancos {
  verificar(
    userId: string,
    banco: string,
  ): Promise<Result<void, PlanPlusRequeridoError>>;
}

/** Sin límite: para los flujos que no pasan por un plan (scripts del dueño). */
export const SIN_LIMITE_BANCOS: ILimiteBancos = {
  verificar: () => Promise.resolve(Result.ok(undefined)),
};

/**
 * LimiteBancosPlanGratis — el plan gratis importa cartolas de a lo más
 * `maximo` bancos (IMP-24, S15): los primeros desde los que la cuenta importó.
 * Un banco nuevo pasa mientras queden cupos. Los datos ya importados de otros
 * bancos no se tocan ni se ocultan (PLA-07); solo no se puede importar más de
 * ellos. Con Plus no hay límite.
 */
export class LimiteBancosPlanGratis implements ILimiteBancos {
  constructor(
    private readonly verificadorPlus: IVerificadorPlus,
    private readonly bancos: IBancosImportadosReader,
    private readonly maximo: number,
  ) {}

  async verificar(
    userId: string,
    banco: string,
  ): Promise<Result<void, PlanPlusRequeridoError>> {
    if (await this.verificadorPlus.tienePlus(userId)) {
      return Result.ok(undefined);
    }

    const usados = await this.bancos.bancosEnOrdenDeImportacion(userId);
    const permitidos = usados.slice(0, this.maximo);
    const pasa = permitidos.includes(banco) || usados.length < this.maximo;

    return pasa
      ? Result.ok(undefined)
      : Result.fail(new PlanPlusRequeridoError());
  }
}
