import { Result } from '../../shared/result';
import { BancoNoReconocidoError } from '../../domain/errors/banco-no-reconocido.error';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../domain/value-objects/tipo-cuenta';

/** Resultado de la detección de banco. */
export interface DetectedBank {
  banco: BancoConocido;
  tipoCuenta: TipoCuentaConocido;
  numeroCuenta: string;
}

/**
 * IBankDetector — port de aplicación.
 *
 * Define el contrato que cualquier implementación de detección de banco
 * debe cumplir. La implementación concreta vive en infrastructure/excel/
 * y no es conocida por el use case.
 *
 * API asíncrona porque ExcelJS (la implementación actual) es Promise-based.
 * Ver ADR-007.
 */
export interface IBankDetector {
  detect(
    buffer: Buffer,
    originalName: string,
  ): Promise<Result<DetectedBank, BancoNoReconocidoError>>;
}
