import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import { Bucket } from '../../domain/value-objects/bucket';
import { Categoria } from '../../domain/value-objects/categoria';

/**
 * DetalleBucketRow — proyección de una transacción para el detalle de un
 * bucket (US-017).
 *
 * Sin `bucketId`: el bucket es el input de la consulta, no un campo de
 * salida (KISS — ver design.md). Los montos son BigInt — la serialización a
 * string ocurre solo en el DTO HTTP.
 *
 * `categoria` (US-013 CATAPI-05) es la Categoria de dominio ya foldeada —
 * `null` para filas Ingreso/SinCategoria o con un id no reconocido
 * (defensive), vía el mismo `foldCategoriaId` compartido con
 * PrismaMovimientosMesRepository.
 */
export interface DetalleBucketRow {
  readonly id: string;
  readonly fecha: Date;
  readonly descripcion: string;
  readonly cargo: bigint;
  readonly abono: bigint;
  readonly banco: string;
  readonly tipoCuenta: string;
  readonly numeroCuenta: string;
  readonly categoria: { readonly id: string; readonly nombre: Categoria } | null;
}

/**
 * IDetalleBucketReader — port de lectura para el detalle de un bucket (US-017).
 *
 * Narrow port: solo expone la consulta que necesita
 * ObtenerDetalleBucketUseCase (SOLID ISP). NO extiende IMovimientosMesReader
 * — ver design.md, Open design question 1.
 */
export interface IDetalleBucketReader {
  findByPeriodoYBucket(
    userId: string,
    periodo: PeriodoMes,
    bucket: Bucket,
  ): Promise<ReadonlyArray<DetalleBucketRow>>;
}

/** Token de inyección — las interfaces se borran en runtime. */
export const DETALLE_BUCKET_READER = 'IDetalleBucketReader';
