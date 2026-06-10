import { Result } from '../../shared/result';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { EstructuraInvalidaError } from '../../domain/errors/estructura-invalida.error';

/**
 * Resultado de validar la estructura de un archivo bancario.
 *
 *   filaEncabezados      → fila (1-indexada) donde están los encabezados.
 *   primeraFilaDatos     → fila donde empiezan los datos (filaEncabezados + 1).
 *   totalFilasDatos      → cantidad de filas de datos detectadas (puede ser 0).
 */
export interface ValidatedStructure {
  readonly banco: BancoConocido;
  readonly filaEncabezados: number;
  readonly primeraFilaDatos: number;
  readonly totalFilasDatos: number;
}

/**
 * Port — valida que el archivo cumpla la estructura esperada para el banco.
 *
 * La implementación concreta vive en infraestructura (ExcelStructureValidatorService).
 * Recibe el buffer del archivo y el banco ya identificado en el paso previo.
 */
export interface IStructureValidator {
  validate(
    buffer: Buffer,
    banco: BancoConocido,
  ): Promise<Result<ValidatedStructure, EstructuraInvalidaError>>;
}
