import { Result } from '../../shared/result';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { EstructuraPdfInvalidaError } from '../../domain/errors/estructura-pdf-invalida.error';
import { RangoFechasInvalidoError } from '../../domain/errors/rango-fechas-invalido.error';

/** Columnas canónicas — duplica el tipo de infra a propósito (ADR-005: application NO importa de infrastructure). */
export type ColumnaPdfValidada = 'fecha' | 'descripcion' | 'cargo' | 'abono';

export interface RangoXValidado {
  readonly col: ColumnaPdfValidada;
  readonly xMin: number;
  readonly xMax: number;
}

/**
 * Resultado de validar la estructura de un PDF bancario.
 *
 *   periodo            → fecha "desde"/"hasta" del statement, en ISO
 *                         (`YYYY-MM-DD`). `undefined` solo es válido para
 *                         bancos con año explícito por fila (BCI) cuando el
 *                         ancla de período no está presente — para el resto,
 *                         su ausencia produce `RangoFechasInvalidoError` en
 *                         vez de un `Result.ok` con `periodo: undefined`.
 *   paginaInicioTabla  → página (1-indexada) donde empieza la tabla de movimientos.
 *   rangosX            → rango de X por columna canónica, para que PR4
 *                         (normalización) reparta tokens vía `agruparTokens`.
 *   toleranciaY        → tolerancia de Y para agrupar filas (`agruparTokens`).
 */
export interface EstructuraPdfValidada {
  readonly banco: BancoConocido;
  readonly periodo?: { readonly desde: string; readonly hasta: string };
  readonly paginaInicioTabla: number;
  readonly rangosX: ReadonlyArray<RangoXValidado>;
  readonly toleranciaY: number;
}

/**
 * Port — valida que el PDF cumpla la estructura esperada para el banco.
 *
 * La implementación concreta vive en infraestructura
 * (PdfjsStructureValidatorService). Recibe el buffer del archivo y el banco
 * ya identificado en el paso previo (Track A / IPdfBankDetector).
 */
export interface IPdfStructureValidator {
  validate(
    buffer: Buffer,
    banco: BancoConocido,
  ): Promise<
    Result<
      EstructuraPdfValidada,
      EstructuraPdfInvalidaError | RangoFechasInvalidoError
    >
  >;
}
