import { PlanPlusRequeridoError } from '../../domain/errors/plan-plus-requerido.error';
import { Result } from '../../shared/result';
import type { IBancosImportadosReader } from '../ports/bancos-importados-reader.port';
import type { IExclusionPorUsuario } from '../ports/exclusion-por-usuario.port';
import type { IVerificadorPlus } from '../ports/verificador-plus.port';

/** Lo que la importación necesita del límite de bancos. */
export interface ILimiteBancos {
  /** Solo consulta: para la vista previa, que no escribe. */
  verificar(
    userId: string,
    banco: string,
  ): Promise<Result<void, PlanPlusRequeridoError>>;

  /**
   * Verifica el límite y, si pasa, crea o encuentra la cuenta con `asegurar`,
   * las dos cosas de a una por usuario: dos importaciones simultáneas de dos
   * bancos nuevos no pueden tomar las dos el último cupo.
   */
  asegurarCuenta<T>(
    userId: string,
    banco: string,
    asegurar: () => Promise<T>,
  ): Promise<Result<T, PlanPlusRequeridoError>>;
}

/** Sin límite: para los flujos que no pasan por un plan (scripts del dueño). */
export const SIN_LIMITE_BANCOS: ILimiteBancos = {
  verificar: () => Promise.resolve(Result.ok(undefined)),
  asegurarCuenta: async (_userId, _banco, asegurar) =>
    Result.ok(await asegurar()),
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
    private readonly exclusion: IExclusionPorUsuario,
  ) {}

  async verificar(
    userId: string,
    banco: string,
  ): Promise<Result<void, PlanPlusRequeridoError>> {
    if (await this.verificadorPlus.tienePlus(userId)) {
      return Result.ok(undefined);
    }
    return this.verificarGratis(userId, banco);
  }

  async asegurarCuenta<T>(
    userId: string,
    banco: string,
    asegurar: () => Promise<T>,
  ): Promise<Result<T, PlanPlusRequeridoError>> {
    // Plus has no limit to protect: no lock, exactly the write of always.
    if (await this.verificadorPlus.tienePlus(userId)) {
      return Result.ok(await asegurar());
    }
    return this.exclusion.enExclusiva(userId, async () => {
      const limite = await this.verificarGratis(userId, banco);
      return limite.isFail()
        ? Result.fail(limite.getError())
        : Result.ok(await asegurar());
    });
  }

  private async verificarGratis(
    userId: string,
    banco: string,
  ): Promise<Result<void, PlanPlusRequeridoError>> {
    const usados = await this.bancos.bancosEnOrdenDeImportacion(userId);
    const permitidos = usados.slice(0, this.maximo);
    const pasa = permitidos.includes(banco) || usados.length < this.maximo;

    return pasa
      ? Result.ok(undefined)
      : Result.fail(new PlanPlusRequeridoError());
  }
}
