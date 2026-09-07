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
  /**
   * `password?` (design.md D-01) es OPCIONAL Y AL FINAL — ningún caller
   * existente deja de compilar. La unión de error NO se amplía (D-05): un
   * PDF con password sin resolver nunca llega hasta acá, porque detect
   * (IPdfBankDetector) corre primero en el pipeline compartido y corta ahí
   * (D-06). Si algún día se invoca `normalize` sin un `detect` previo, la
   * password fallida se enmascara de vuelta en `EstructuraPdfInvalidaError`
   * (`{ tipo: 'PdfIlegible' }`) — un PDF con clave se leería como estructura
   * malformada, no como "protegido".
   */
  normalize(
    buffer: Buffer,
    banco: BancoConocido,
    password?: string,
  ): Promise<
    Result<
      ReadonlyArray<Transaccion>,
      EstructuraPdfInvalidaError | RangoFechasInvalidoError
    >
  >;
}
