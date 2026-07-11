import { PeriodoMes } from '../../domain/value-objects/periodo-mes';

/**
 * MovimientoMesRow — proyección de una transacción para la consulta mensual.
 *
 * Incluye campos de origen de banco/cuenta para la vista consolidada.
 * Los montos son BigInt — no se convierten a number en la capa de application.
 * La serialización a string ocurre solo en el DTO HTTP.
 */
export interface MovimientoMesRow {
  readonly id: string;
  readonly fecha: Date;
  readonly descripcion: string;
  readonly cargo: bigint;
  readonly abono: bigint;
  readonly banco: string;
  readonly tipoCuenta: string;
  readonly numeroCuenta: string;
  readonly bucketId: string | null;
}

/**
 * IMovimientosMesReader — port de lectura para la consolidación mensual (US-014).
 *
 * Narrow port: solo expone la consulta que necesita ObtenerMovimientosMesUseCase.
 * Sin Prisma ni NestJS — la capa de application es agnóstica de infraestructura.
 */
export interface IMovimientosMesReader {
  findByPeriodo(
    userId: string,
    periodo: PeriodoMes,
  ): Promise<ReadonlyArray<MovimientoMesRow>>;
}

/** Token de inyección — las interfaces se borran en runtime. */
export const MOVIMIENTOS_MES_READER = 'IMovimientosMesReader';
