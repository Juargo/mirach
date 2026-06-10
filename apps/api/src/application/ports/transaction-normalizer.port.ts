import { Result } from '../../shared/result';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { Transaccion } from '../../domain/value-objects/transaccion';
import { NormalizacionInvalidaError } from '../../domain/errors/normalizacion-invalida.error';

/**
 * Port — normaliza las filas de transacciones de un archivo bancario al
 * esquema canónico { fecha, descripcion, cargo, abono } (US-007).
 *
 * Recibe el buffer del archivo y el banco identificado en pasos previos.
 * Se asume que la estructura ya fue validada (US-002).
 */
export interface ITransactionNormalizer {
  normalize(
    buffer: Buffer,
    banco: BancoConocido,
  ): Promise<Result<ReadonlyArray<Transaccion>, NormalizacionInvalidaError>>;
}
