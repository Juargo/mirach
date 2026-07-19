import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import { Bucket } from '../../domain/value-objects/bucket';

/**
 * MovimientoMesRow — proyección de una transacción para la consulta mensual.
 *
 * Incluye campos de origen de banco/cuenta para la vista consolidada.
 * Los montos son BigInt — no se convierten a number en la capa de application.
 * La serialización a string ocurre solo en el DTO HTTP.
 *
 * `bucket` es el Bucket de dominio ya foldeado (nunca el bucketId físico de
 * Prisma) — el fold vive en el repositorio (BUCKET_ID_TO_BUCKET), igual que
 * en prisma-resumen-mes. La capa de application solo conoce el enum.
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
  readonly bucket: Bucket;
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
