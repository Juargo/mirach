import { Result } from '../../shared/result';
import { PlanPlusRequeridoError } from '../../domain/errors/plan-plus-requerido.error';
import { DiaCorte } from '../../domain/value-objects/mes-financiero';
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import type { IPerfilPresupuestoReader } from '../ports/perfil-presupuesto.port';
import type { IReloj } from '../ports/reloj.port';
import type { IUltimoPeriodoConDatosReader } from '../ports/ultimo-periodo-con-datos.port';
import type { IVerificadorPlus } from '../ports/verificador-plus.port';

/**
 * VentanaPlanGratis — la ventana de meses visibles del plan gratis (S14,
 * PLA-01). Es la única regla: ninguna ruta la calcula.
 *
 * La ventana de una cuenta es su mes ancla y los `mesesVisibles - 1` meses
 * financieros anteriores, consecutivos, con o sin movimientos. El ancla es el
 * último mes con movimientos de la cuenta (el mismo que `resolverPeriodo`
 * usa cuando `periodo` falta) o, sin ninguno, el mes financiero en curso. Lo
 * que queda antes de la ventana se oculta; nunca se borra (S4).
 *
 * Una cuenta con Plus no tiene ventana, y mientras el cobro está apagado toda
 * cuenta tiene Plus (`IVerificadorPlus`). Un período o una fecha inválidos
 * pasan: los rechaza su validación de siempre, con su 400.
 */
export class VentanaPlanGratis {
  constructor(
    private readonly verificadorPlus: IVerificadorPlus,
    private readonly perfilReader: IPerfilPresupuestoReader,
    private readonly ultimoPeriodoReader: IUltimoPeriodoConDatosReader,
    private readonly reloj: IReloj,
    private readonly mesesVisibles: number,
  ) {}

  /** El mes más antiguo visible, o `null` si la cuenta no tiene ventana. */
  async primerMesVisible(
    userId: string,
    diaCorte: DiaCorte,
  ): Promise<PeriodoMes | null> {
    if (await this.verificadorPlus.tienePlus(userId)) return null;
    return this.calcularPrimerMes(userId, diaCorte);
  }

  /** Un `periodo` explícito de una lectura; ausente, responde como siempre. */
  async verificarPeriodo(
    userId: string,
    periodo: string | undefined,
  ): Promise<Result<void, PlanPlusRequeridoError>> {
    if (periodo === undefined) return Result.ok(undefined);
    // El formato no depende del corte: uno inválido lo responde el caso de uso.
    if (PeriodoMes.crear(periodo).isFail()) return Result.ok(undefined);

    return this.exigirDentro(userId, (diaCorte) =>
      PeriodoMes.crear(periodo, diaCorte).getValue(),
    );
  }

  /** La fecha de un movimiento a registrar: su mes no puede quedar oculto. */
  async verificarFecha(
    userId: string,
    fecha: Date,
  ): Promise<Result<void, PlanPlusRequeridoError>> {
    if (Number.isNaN(fecha.getTime())) return Result.ok(undefined);

    return this.exigirDentro(userId, (diaCorte) =>
      PeriodoMes.queContiene(fecha, diaCorte),
    );
  }

  private async exigirDentro(
    userId: string,
    aPeriodo: (diaCorte: DiaCorte) => PeriodoMes,
  ): Promise<Result<void, PlanPlusRequeridoError>> {
    if (await this.verificadorPlus.tienePlus(userId)) {
      return Result.ok(undefined);
    }
    const perfil = await this.perfilReader.obtener(userId);
    const diaCorte = perfil.mesFinanciero.diaCorte;
    const primero = await this.calcularPrimerMes(userId, diaCorte);

    return aPeriodo(diaCorte).valor < primero.valor
      ? Result.fail(new PlanPlusRequeridoError())
      : Result.ok(undefined);
  }

  private async calcularPrimerMes(
    userId: string,
    diaCorte: DiaCorte,
  ): Promise<PeriodoMes> {
    const ultimo = await this.ultimoPeriodoReader.ultimoPeriodoConDatos(
      userId,
      diaCorte,
    );
    const ancla =
      ultimo ?? PeriodoMes.queContiene(this.reloj.ahora(), diaCorte);
    return ancla.mesesAntes(this.mesesVisibles - 1);
  }
}
