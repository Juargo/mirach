import 'dotenv/config';
import * as fs from 'fs';
import { join } from 'path';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { PrismaAccountRepository } from '../src/infrastructure/persistence/prisma-account.repository';
import { PrismaIngestaRepository } from '../src/infrastructure/persistence/prisma-ingesta.repository';
import { PrismaCatalogoClasificacionRepository } from '../src/infrastructure/persistence/prisma-catalogo-clasificacion.repository';
import { PrismaTransaccionBucketRepository } from '../src/infrastructure/persistence/prisma-transaccion-bucket.repository';
import { PrismaTransaccionClasificacionRepository } from '../src/infrastructure/persistence/prisma-transaccion-clasificacion.repository';
import { PrismaTransaccionExistenteReader } from '../src/infrastructure/persistence/prisma-transaccion-existente.reader';
import { NoOpCryptoService } from '../src/infrastructure/persistence/no-op-crypto.service';
import { IngestFileUseCase } from '../src/application/use-cases/ingest-file.use-case';
import { DetectBankUseCase } from '../src/application/use-cases/detect-bank.use-case';
import { DetectPdfBankUseCase } from '../src/application/use-cases/detect-pdf-bank.use-case';
import { ValidateStructureUseCase } from '../src/application/use-cases/validate-structure.use-case';
import { ValidatePdfStructureUseCase } from '../src/application/use-cases/validate-pdf-structure.use-case';
import { NormalizeTransactionsUseCase } from '../src/application/use-cases/normalize-transactions.use-case';
import { NormalizePdfTransactionsUseCase } from '../src/application/use-cases/normalize-pdf-transactions.use-case';
import { PersistTransactionsUseCase } from '../src/application/use-cases/persist-transactions.use-case';
import { CategorizarTransaccionUseCase } from '../src/application/use-cases/categorizar-transaccion.use-case';
import { DetectarDuplicadosUseCase } from '../src/application/use-cases/detectar-duplicados.use-case';
import { ProcessIngestaUseCase } from '../src/application/use-cases/process-ingesta.use-case';
import { ExcelBankDetectorService } from '../src/infrastructure/excel/excel-bank-detector.service';
import { ExcelStructureValidatorService } from '../src/infrastructure/excel/excel-structure-validator.service';
import { ExcelTransactionNormalizerService } from '../src/infrastructure/excel/excel-transaction-normalizer.service';
import { PdfjsBankDetectorService } from '../src/infrastructure/pdf/pdfjs-bank-detector.service';
import { PdfjsStructureValidatorService } from '../src/infrastructure/pdf/pdfjs-structure-validator.service';
import { PdfjsTransactionNormalizerService } from '../src/infrastructure/pdf/pdfjs-transaction-normalizer.service';
import { IFileReader } from '../src/application/ports/file-reader.port';

const RUN_ID = `it-reupload-${Date.now()}`;
const USER_ID = `user-${RUN_ID}`;

/** IFileReader mínimo sobre un buffer fijo — reutilizable entre las 2 subidas. */
class BufferFileReader implements IFileReader {
  constructor(
    private readonly buffer: Buffer,
    private readonly originalName: string,
  ) {}
  getBuffer(): Buffer {
    return this.buffer;
  }
  getOriginalName(): string {
    return this.originalName;
  }
  getSizeInBytes(): number {
    return this.buffer.byteLength;
  }
}

/**
 * End-to-end (sin HTTP) del pipeline COMPLETO vía ProcessIngestaUseCase
 * contra la BD real de desarrollo (US-005, Slice 2, task 8.2): sube el mismo
 * archivo dos veces para el MISMO usuario/cuenta y prueba que la 2da subida
 * detecta y omite los duplicados en vez de re-insertarlos.
 */
describe('Re-upload dedupe end-to-end (US-005, real dev DB)', () => {
  const prisma = createPrismaClient();
  const crypto = new NoOpCryptoService();

  const processIngesta = new ProcessIngestaUseCase(
    new IngestFileUseCase(),
    new DetectBankUseCase(new ExcelBankDetectorService()),
    new DetectPdfBankUseCase(new PdfjsBankDetectorService()),
    new PrismaAccountRepository(prisma),
    new ValidateStructureUseCase(new ExcelStructureValidatorService()),
    new ValidatePdfStructureUseCase(new PdfjsStructureValidatorService()),
    new NormalizeTransactionsUseCase(new ExcelTransactionNormalizerService()),
    new NormalizePdfTransactionsUseCase(
      new PdfjsTransactionNormalizerService(),
    ),
    new PersistTransactionsUseCase(new PrismaIngestaRepository(prisma, crypto)),
    new PrismaCatalogoClasificacionRepository(prisma),
    new PrismaTransaccionBucketRepository(prisma),
    new CategorizarTransaccionUseCase(),
    new PrismaTransaccionClasificacionRepository(prisma),
    new DetectarDuplicadosUseCase(
      new PrismaTransaccionExistenteReader(prisma, crypto),
    ),
  );

  const fixture = join(__dirname, 'fixtures', 'movimientos-test.xlsx');
  const buffer = fs.readFileSync(fixture);
  const nombreArchivo = `movimientos-${RUN_ID}.xlsx`;

  const createdIngestaIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: { id: USER_ID, nombre: 'Test Reupload' },
    });
  });

  afterAll(async () => {
    await prisma.transaccion.deleteMany({
      where: { ingestaId: { in: createdIngestaIds } },
    });
    await prisma.ingesta.deleteMany({
      where: { id: { in: createdIngestaIds } },
    });
    await prisma.account.deleteMany({ where: { userId: USER_ID } });
    await prisma.user.deleteMany({ where: { id: USER_ID } });
    await prisma.$disconnect();
  });

  it('1ra subida: persiste todas las filas normalmente, duplicadosOmitidos = 0', async () => {
    const result = await processIngesta.execute({
      fileReader: new BufferFileReader(buffer, nombreArchivo),
      userId: USER_ID,
    });

    expect(result.isOk()).toBe(true);
    const value = result.getValue();
    createdIngestaIds.push(value.ingestaId);

    expect(value.duplicadosOmitidos).toBe(0);
    expect(value.total).toBeGreaterThan(0);
    expect(value.total).toBe(value.transacciones.length);

    const filas = await prisma.transaccion.count({
      where: { ingestaId: value.ingestaId },
    });
    expect(filas).toBe(value.total);
  });

  it('2da subida (mismo archivo, mismo usuario): 0 filas nuevas, duplicadosOmitidos = N, la 1ra ingesta queda INTACTA', async () => {
    const primero = await prisma.ingesta.findFirst({
      where: { id: { in: createdIngestaIds } },
    });
    const primeraFilasAntes = await prisma.transaccion.findMany({
      where: { ingestaId: primero!.id },
      select: {
        id: true,
        fecha: true,
        descripcion: true,
        cargo: true,
        abono: true,
      },
    });

    const result = await processIngesta.execute({
      fileReader: new BufferFileReader(buffer, nombreArchivo),
      userId: USER_ID,
    });

    expect(result.isOk()).toBe(true);
    const value = result.getValue();
    createdIngestaIds.push(value.ingestaId);

    // 2da subida: 0 filas REALMENTE nuevas, todo se detectó como duplicado.
    expect(value.total).toBe(0);
    expect(value.transacciones).toEqual([]);
    expect(value.duplicadosOmitidos).toBe(primeraFilasAntes.length);

    // La 2da Ingesta queda PROCESADA con duplicadosOmitidos = N (no FALLIDA).
    const segundaIngesta = await prisma.ingesta.findUnique({
      where: { id: value.ingestaId },
    });
    expect(segundaIngesta?.estado).toBe('PROCESADA');
    expect(segundaIngesta?.duplicadosOmitidos).toBe(primeraFilasAntes.length);
    expect(segundaIngesta?.totalTransacciones).toBe(0);

    // 0 filas Transaccion nuevas asociadas a la 2da Ingesta.
    const segundaFilas = await prisma.transaccion.count({
      where: { ingestaId: value.ingestaId },
    });
    expect(segundaFilas).toBe(0);

    // La 1ra Ingesta y sus filas quedan EXACTAMENTE igual (read-only NFR):
    // ni una fila fue tocada/actualizada/borrada por la 2da subida.
    const primeraFilasDespues = await prisma.transaccion.findMany({
      where: { ingestaId: primero!.id },
      select: {
        id: true,
        fecha: true,
        descripcion: true,
        cargo: true,
        abono: true,
      },
    });
    expect(primeraFilasDespues).toEqual(primeraFilasAntes);
    const primeraIngestaDespues = await prisma.ingesta.findUnique({
      where: { id: primero!.id },
    });
    expect(primeraIngestaDespues?.estado).toBe('PROCESADA');
  });
});
