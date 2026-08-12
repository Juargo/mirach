import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import { Bucket } from '../../domain/value-objects/bucket';

/**
 * DetalleBucketRow — proyección de una transacción para el detalle de un
 * bucket (US-017).
 *
 * Sin `bucketId`: el bucket es el input de la consulta, no un campo de
 * salida (KISS — ver design.md). Los montos son BigInt — la serialización a
 * string ocurre solo en el DTO HTTP.
 *
 * `categoria` (US-013 CATAPI-05, US-037/ADR-037 CAT037-06) es el
 * `{id, nombre}` de la fila del usuario ya foldeada — `null` solo para
 * filas Ingreso/SinCategoria, vía el mismo `foldCategoria`
 * (fold-categoria.ts) compartido con PrismaMovimientosMesRepository.
 * `nombre` es `string`: ownership (`WHERE userId`) es la única autoridad de
 * validez, ya no un enum cerrado (D-01).
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
  readonly categoria: {
    readonly id: string;
    readonly nombre: string;
  } | null;
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
