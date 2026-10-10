import { readFileSync } from 'node:fs';
import path from 'node:path';

import { EjecutarPipelineIngestaUseCase } from '../../application/use-cases/ejecutar-pipeline-ingesta.use-case';
import { IngestFileUseCase } from '../../application/use-cases/ingest-file.use-case';
import { DetectBankUseCase } from '../../application/use-cases/detect-bank.use-case';
import { DetectPdfBankUseCase } from '../../application/use-cases/detect-pdf-bank.use-case';
import { ValidateStructureUseCase } from '../../application/use-cases/validate-structure.use-case';
import { ValidatePdfStructureUseCase } from '../../application/use-cases/validate-pdf-structure.use-case';
import { NormalizeTransactionsUseCase } from '../../application/use-cases/normalize-transactions.use-case';
import { NormalizePdfTransactionsUseCase } from '../../application/use-cases/normalize-pdf-transactions.use-case';
import type { IFileReader } from '../../application/ports/file-reader.port';
import { ExcelBankDetectorService } from './excel-bank-detector.service';
import { ExcelStructureValidatorService } from './excel-structure-validator.service';
import { ExcelTransactionNormalizerService } from './excel-transaction-normalizer.service';
import { PdfjsBankDetectorService } from '../pdf/pdfjs-bank-detector.service';
import { PdfjsStructureValidatorService } from '../pdf/pdfjs-structure-validator.service';
import { PdfjsTransactionNormalizerService } from '../pdf/pdfjs-transaction-normalizer.service';
import { NoOpLogger } from '../../../test/support/logger.double';
import { construirCartolaRevision } from '../../../prisma/fixtures/generar-cartola-revision';

/**
 * The App Review sample statement (ADR-051) must go through the SAME parser
 * the API uses for an upload. These specs run the real pipeline (detect,
 * validate, normalize) on the committed file and on a fresh generator run.
 */
const RUTA_FIXTURE = path.resolve(
  __dirname,
  '../../../prisma/fixtures/cartola-revision.xlsx',
);

function leer(buffer: Buffer, nombre: string): IFileReader {
  return {
    getBuffer: () => buffer,
    getOriginalName: () => nombre,
    getSizeInBytes: () => buffer.length,
  };
}

function crearPipelineReal(): EjecutarPipelineIngestaUseCase {
  const logger = new NoOpLogger();
  return new EjecutarPipelineIngestaUseCase(
    new IngestFileUseCase(logger),
    new DetectBankUseCase(new ExcelBankDetectorService(), logger),
    new DetectPdfBankUseCase(new PdfjsBankDetectorService(), logger),
    new ValidateStructureUseCase(new ExcelStructureValidatorService(), logger),
    new ValidatePdfStructureUseCase(
      new PdfjsStructureValidatorService(),
      logger,
    ),
    new NormalizeTransactionsUseCase(
      new ExcelTransactionNormalizerService(),
      logger,
    ),
    new NormalizePdfTransactionsUseCase(
      new PdfjsTransactionNormalizerService(),
      logger,
    ),
    logger,
  );
}

describe('cartola de revisión (App Review, ADR-051)', () => {
  it('el archivo commiteado se parsea con el pipeline real, sin error y con movimientos', async () => {
    const buffer = readFileSync(RUTA_FIXTURE);

    const result = await crearPipelineReal().execute({
      fileReader: leer(buffer, 'cartola-revision.xlsx'),
    });

    expect(result.isOk()).toBe(true);
    const { banco, transacciones } = result.getValue();
    expect(banco.banco).toBe('BCI');
    expect(transacciones.length).toBeGreaterThan(0);
  });

  it('cubre el mes anterior y el mes en curso, con ingresos y gastos', async () => {
    const result = await crearPipelineReal().execute({
      fileReader: leer(readFileSync(RUTA_FIXTURE), 'cartola-revision.xlsx'),
    });

    const { transacciones } = result.getValue();
    const meses = new Set(
      transacciones.map((t) => t.fecha.toISOString().slice(0, 7)),
    );
    expect([...meses].sort()).toEqual(['2026-09', '2026-10']);
    expect(transacciones.some((t) => t.abono > 0n && t.cargo === 0n)).toBe(
      true,
    );
    expect(transacciones.some((t) => t.cargo > 0n && t.abono === 0n)).toBe(
      true,
    );
  });

  it('no repite ninguna fila (fecha + glosa + monto): la deduplicación no debe omitir nada', async () => {
    const result = await crearPipelineReal().execute({
      fileReader: leer(readFileSync(RUTA_FIXTURE), 'cartola-revision.xlsx'),
    });

    const claves = result
      .getValue()
      .transacciones.map(
        (t) =>
          `${t.fecha.toISOString()}|${t.descripcion}|${t.cargo}|${t.abono}`,
      );
    expect(new Set(claves).size).toBe(claves.length);
  });

  it('el generador produce un archivo equivalente al commiteado', async () => {
    const pipeline = crearPipelineReal();
    const commiteado = await pipeline.execute({
      fileReader: leer(readFileSync(RUTA_FIXTURE), 'cartola-revision.xlsx'),
    });
    const generado = await pipeline.execute({
      fileReader: leer(await construirCartolaRevision(), 'generado.xlsx'),
    });

    expect(generado.isOk()).toBe(true);
    const resumir = (r: typeof generado) =>
      r
        .getValue()
        .transacciones.map((t) => [
          t.fecha.toISOString(),
          t.descripcion,
          t.cargo,
          t.abono,
        ]);
    expect(resumir(generado)).toEqual(resumir(commiteado));
  });
});
