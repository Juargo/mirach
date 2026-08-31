/**
 * preview-rowindex-estable.spec.ts — T-01 (design.md D-07, MANDATORY-BLOCKING
 * for PR1).
 *
 * Proves `rowIndex` stability BY CONSTRUCTION: running `PreviewIngestaUseCase`
 * twice over the SAME fixture bytes, nothing in the chain reads DB/clock/
 * session/random (Excel walks sheet order, PDF sorts tokens by a total
 * (page,y,x) order), so `(rowIndex, descripcion, cargo, abono)` MUST be
 * identical across both runs. Only `sugerido` may differ, because that field
 * alone depends on the injected catalog — which this test deliberately
 * varies between run 1 (empty) and run 2 (a patrón that matches).
 *
 * Unit test, stubbed reader ports, NO DB — `EjecutarPipelineIngestaUseCase`
 * is real (pure parsing, no I/O), but `IAccountReader`/
 * `ITransaccionExistenteReader`/`ICatalogoClasificacion` are hand-built
 * doubles (same pattern as `crear-preview-ingesta.spec.ts`'s no-write test,
 * minus the Prisma Proxy — here there is no Prisma at all).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { Result } from '../src/shared/result';
import { PreviewIngestaUseCase } from '../src/application/use-cases/preview-ingesta.use-case';
import { EjecutarPipelineIngestaUseCase } from '../src/application/use-cases/ejecutar-pipeline-ingesta.use-case';
import { CategorizarTransaccionUseCase } from '../src/application/use-cases/categorizar-transaccion.use-case';
import { IngestFileUseCase } from '../src/application/use-cases/ingest-file.use-case';
import { DetectBankUseCase } from '../src/application/use-cases/detect-bank.use-case';
import { DetectPdfBankUseCase } from '../src/application/use-cases/detect-pdf-bank.use-case';
import { ValidateStructureUseCase } from '../src/application/use-cases/validate-structure.use-case';
import { ValidatePdfStructureUseCase } from '../src/application/use-cases/validate-pdf-structure.use-case';
import { NormalizeTransactionsUseCase } from '../src/application/use-cases/normalize-transactions.use-case';
import { NormalizePdfTransactionsUseCase } from '../src/application/use-cases/normalize-pdf-transactions.use-case';
import { ExcelBankDetectorService } from '../src/infrastructure/excel/excel-bank-detector.service';
import { ExcelStructureValidatorService } from '../src/infrastructure/excel/excel-structure-validator.service';
import { ExcelTransactionNormalizerService } from '../src/infrastructure/excel/excel-transaction-normalizer.service';
import { PdfjsBankDetectorService } from '../src/infrastructure/pdf/pdfjs-bank-detector.service';
import { PdfjsStructureValidatorService } from '../src/infrastructure/pdf/pdfjs-structure-validator.service';
import { PdfjsTransactionNormalizerService } from '../src/infrastructure/pdf/pdfjs-transaction-normalizer.service';
import { IAccountReader } from '../src/application/ports/account-reader.port';
import { ITransaccionExistenteReader } from '../src/application/ports/transaccion-existente-reader.port';
import { ICatalogoClasificacion } from '../src/application/ports/catalogo-clasificacion.port';
import { IFileReader } from '../src/application/ports/file-reader.port';
import { PatronClasificacion } from '../src/domain/value-objects/patron-clasificacion';
import { Bucket } from '../src/domain/value-objects/bucket';
import { NoOpLogger } from './support/logger.double';

const XLSX_FIXTURE = join(__dirname, 'fixtures', 'movimientos-test.xlsx');
const PDF_FIXTURE = join(__dirname, 'fixtures', 'pdf', 'bci-cartola-test.pdf');

class FakeFileReader implements IFileReader {
  private readonly buffer: Buffer;
  constructor(
    path: string,
    private readonly originalName: string,
  ) {
    this.buffer = readFileSync(path);
  }
  getBuffer(): Buffer {
    return this.buffer;
  }
  getOriginalName(): string {
    return this.originalName;
  }
  getSizeInBytes(): number {
    return this.buffer.length;
  }
}

/** Account nunca existe todavía ⇒ mask all-false, txExistenteReader NUNCA
 * se consulta (D-06) — no hace falta un stub con comportamiento real. */
function fakeAccountReader(): IAccountReader {
  return { findByBanco: () => Promise.resolve(Result.ok(null)) };
}

function fakeTxExistenteReader(): ITransaccionExistenteReader {
  return {
    buscarPorCuentaYRango: () =>
      Promise.reject(
        new Error(
          'no debería consultarse — accountReader siempre retorna null',
        ),
      ),
  };
}

/** Catálogo configurable: `[]` en el run 1, un patrón "atrapa-todo" en el
 * run 2, para que `sugerido` pueda diferir mientras `rowIndex`/`transaccion`
 * se mantienen idénticos. */
function fakeCatalogo(
  patrones: ReadonlyArray<PatronClasificacion>,
): ICatalogoClasificacion {
  return { findAll: () => Promise.resolve(Result.ok(patrones)) };
}

/** Patrón que matchea CUALQUIER descripción no vacía (CONTAINS de la letra
 * "a", presente en prácticamente cualquier descripción en español real). */
const PATRON_ATRAPA_TODO = new PatronClasificacion({
  id: 'patron-atrapa-todo',
  patron: 'a',
  matchType: 'CONTAINS',
  categoria: {
    id: 'cat-atrapa-todo',
    nombre: 'Atrapa Todo',
    bucket: Bucket.Necesidades,
  },
  prioridad: 1,
});

function buildPreviewIngesta(
  catalogo: ICatalogoClasificacion,
): PreviewIngestaUseCase {
  const logger = new NoOpLogger();
  const ejecutarPipelineUseCase = new EjecutarPipelineIngestaUseCase(
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

  return new PreviewIngestaUseCase(
    ejecutarPipelineUseCase,
    fakeAccountReader(),
    fakeTxExistenteReader(),
    catalogo,
    new CategorizarTransaccionUseCase(logger),
    logger,
  );
}

/** Firma estable comparada entre corridas — NUNCA incluye `sugerido`. */
function firmaEstable(
  filas: ReadonlyArray<{
    rowIndex: number;
    transaccion: { descripcion: string; cargo: bigint; abono: bigint };
  }>,
) {
  return filas.map((f) => [
    f.rowIndex,
    f.transaccion.descripcion,
    f.transaccion.cargo,
    f.transaccion.abono,
  ]);
}

describe.each([
  ['Excel (BCI, movimientos-test.xlsx)', XLSX_FIXTURE, 'movimientos-test.xlsx'],
  ['PDF (BCI, bci-cartola-test.pdf)', PDF_FIXTURE, 'bci-cartola-test.pdf'],
])('T-01 rowIndex stability — %s', (_label, fixturePath, originalName) => {
  it('dos corridas con el MISMO archivo y un catálogo VACÍO producen filas idénticas (rowIndex, descripcion, cargo, abono)', async () => {
    const useCase = buildPreviewIngesta(fakeCatalogo([]));

    const run1 = await useCase.execute({
      fileReader: new FakeFileReader(fixturePath, originalName),
      userId: 'user-t01',
    });
    const run2 = await useCase.execute({
      fileReader: new FakeFileReader(fixturePath, originalName),
      userId: 'user-t01',
    });

    expect(run1.isOk()).toBe(true);
    expect(run2.isOk()).toBe(true);
    const filas1 = run1.getValue().filas;
    const filas2 = run2.getValue().filas;

    expect(filas1.length).toBeGreaterThan(0);
    expect(firmaEstable(filas2)).toEqual(firmaEstable(filas1));
    filas1.forEach((f, i) => expect(f.rowIndex).toBe(i));
    filas2.forEach((f, i) => expect(f.rowIndex).toBe(i));
  });

  it('un catálogo DIFERENTE en la 2ª corrida mantiene (rowIndex, descripcion, cargo, abono) idénticos — solo `sugerido` puede cambiar', async () => {
    const runVacio = await buildPreviewIngesta(fakeCatalogo([])).execute({
      fileReader: new FakeFileReader(fixturePath, originalName),
      userId: 'user-t01',
    });
    const runConCatalogo = await buildPreviewIngesta(
      fakeCatalogo([PATRON_ATRAPA_TODO]),
    ).execute({
      fileReader: new FakeFileReader(fixturePath, originalName),
      userId: 'user-t01',
    });

    expect(runVacio.isOk()).toBe(true);
    expect(runConCatalogo.isOk()).toBe(true);
    const filasVacio = runVacio.getValue().filas;
    const filasConCatalogo = runConCatalogo.getValue().filas;

    // Corolario D-07: nada se persiste entre corridas, así que `esDuplicado`
    // TAMPOCO puede cambiar — la firma estable ya lo cubre porque
    // `esDuplicado` no participa de la firma (solo depende del reader de
    // duplicados, no del catálogo); lo afirmamos también explícitamente.
    expect(firmaEstable(filasConCatalogo)).toEqual(firmaEstable(filasVacio));
    filasVacio.forEach((f, i) =>
      expect(f.esDuplicado).toBe(filasConCatalogo[i].esDuplicado),
    );

    // `sugerido` SÍ puede (y en este fixture real, DEBE) diferir para al
    // menos una fila — la prueba positiva de que el catálogo importa.
    const algunaFilaDifiere = filasVacio.some(
      (f, i) =>
        JSON.stringify(f.sugerido) !==
        JSON.stringify(filasConCatalogo[i].sugerido),
    );
    expect(algunaFilaDifiere).toBe(true);
  });
});
