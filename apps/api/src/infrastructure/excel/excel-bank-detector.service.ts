import ExcelJS from 'exceljs';
import { Result } from '../../shared/result';
import { IBankDetector, DetectedBank } from '../../application/ports/bank-detector.port';
import { BancoNoReconocidoError } from '../../domain/errors/banco-no-reconocido.error';
import { BancoChileStrategy } from './strategies/banco-chile.strategy';
import { BancoEstadoStrategy } from './strategies/banco-estado.strategy';
import { BciStrategy } from './strategies/bci.strategy';
import { SantanderStrategy } from './strategies/santander.strategy';

/**
 * ExcelBankDetectorService — implementación de IBankDetector usando ExcelJS.
 *
 * Carga el buffer como workbook y aplica cada estrategia en orden hasta
 * encontrar una coincidencia. Si ninguna coincide, retorna Fail.
 *
 * Usa ExcelJS (MIT, sin CVEs) en lugar de SheetJS. Ver ADR-007.
 */
export class ExcelBankDetectorService implements IBankDetector {
  private readonly strategies = [
    new BancoEstadoStrategy(), // Primero: patrón más específico ("CuentaRUT")
    new BancoChileStrategy(),
    new SantanderStrategy(),
    new BciStrategy(),         // Último: patrón más genérico ("Últimos Movimientos")
  ];

  async detect(
    buffer: Buffer,
    originalName: string,
  ): Promise<Result<DetectedBank, BancoNoReconocidoError>> {
    const workbook = new ExcelJS.Workbook();

    try {
      // ExcelJS tipos esperan Buffer<ArrayBuffer> pero @types/node expone
      // Buffer<ArrayBufferLike>. Incompatibilidad de tipos únicamente — en runtime
      // son el mismo objeto. `as any` es la solución hasta que ExcelJS actualice sus tipos.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await workbook.xlsx.load(buffer as any);
    } catch {
      return Result.fail(new BancoNoReconocidoError(originalName));
    }

    const worksheet = workbook.worksheets[0];

    if (!worksheet) {
      return Result.fail(new BancoNoReconocidoError(originalName));
    }

    for (const strategy of this.strategies) {
      if (strategy.matches(worksheet)) {
        return Result.ok(strategy.extract(worksheet));
      }
    }

    return Result.fail(new BancoNoReconocidoError(originalName));
  }
}
