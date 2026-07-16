import { Result } from '../../shared/result';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { Transaccion } from '../../domain/value-objects/transaccion';
import { EstructuraPdfInvalidaError } from '../../domain/errors/estructura-pdf-invalida.error';
import { RangoFechasInvalidoError } from '../../domain/errors/rango-fechas-invalido.error';

/**
 * Port — normaliza las filas de transacciones de un PDF bancario al esquema
 * canónico { fecha, descripcion, cargo, abono } (US-010). Mirror PDF de
 * `ITransactionNormalizer` (Excel) — misma forma de salida, distinta
 * taxonomía de error de entrada: la implementación re-valida la estructura
 * internamente antes de normalizar (design.md decisión #3, "Accept 3× parse
 * across stages"), por eso reutiliza los errores de Track B (PR3) en vez de
 * definir una nueva taxonomía de normalización.
 *
 * Recibe el buffer del archivo y el banco ya identificado en Track A.
 */
export interface IPdfTransactionNormalizer {
  normalize(
    buffer: Buffer,
    banco: BancoConocido,
  ): Promise<
    Result<
      ReadonlyArray<Transaccion>,
      EstructuraPdfInvalidaError | RangoFechasInvalidoError
    >
  >;
}
