/**
 * CLI — punto de entrada para ingesta de archivos bancarios desde terminal.
 *
 * Uso:
 *   pnpm cli -- ./cartola.xlsx
 *   pnpm cli -- /ruta/absoluta/movimientos.xlsx
 *
 * Ejecuta el pipeline completo vía ProcessIngestaUseCase (detectar → asegurar
 * cuenta → validar → normalizar → persistir) — el mismo orquestador que usa
 * el endpoint HTTP (IngestaController), así que ambas entradas comparten
 * genuinamente un único pipeline.
 */

import 'dotenv/config';
import 'reflect-metadata';
import { IngestFileUseCase } from '../../application/use-cases/ingest-file.use-case';
import { DetectBankUseCase } from '../../application/use-cases/detect-bank.use-case';
import { ValidateStructureUseCase } from '../../application/use-cases/validate-structure.use-case';
import { NormalizeTransactionsUseCase } from '../../application/use-cases/normalize-transactions.use-case';
import { PersistTransactionsUseCase } from '../../application/use-cases/persist-transactions.use-case';
import { CategorizarTransaccionUseCase } from '../../application/use-cases/categorizar-transaccion.use-case';
import { ProcessIngestaUseCase } from '../../application/use-cases/process-ingesta.use-case';
import { ExcelBankDetectorService } from '../excel/excel-bank-detector.service';
import { ExcelStructureValidatorService } from '../excel/excel-structure-validator.service';
import { ExcelTransactionNormalizerService } from '../excel/excel-transaction-normalizer.service';
import { PrismaService } from '../persistence/prisma.service';
import { PrismaAccountRepository } from '../persistence/prisma-account.repository';
import { PrismaIngestaRepository } from '../persistence/prisma-ingesta.repository';
import { PrismaCatalogoClasificacionRepository } from '../persistence/prisma-catalogo-clasificacion.repository';
import { PrismaTransaccionBucketRepository } from '../persistence/prisma-transaccion-bucket.repository';
import { PrismaTransaccionClasificacionRepository } from '../persistence/prisma-transaccion-clasificacion.repository';
import { NoOpCryptoService } from '../persistence/no-op-crypto.service';
import { USER_ID_FIJO } from '../persistence/constants';
import { FsFileReaderAdapter } from './fs-file-reader.adapter';

function formatCLP(n: number): string {
  return n.toLocaleString('es-CL');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function main(): Promise<void> {
  // Filtramos "--" porque pnpm lo incluye como separador en process.argv
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const filePath = args[0];

  if (!filePath) {
    console.error('\n❌  Falta la ruta del archivo.');
    console.error('   Uso: pnpm cli -- <ruta-del-archivo.xlsx>\n');
    process.exit(1);
  }

  // Adapter: transforma una ruta del filesystem en IFileReader
  let fileReader: FsFileReaderAdapter;
  try {
    fileReader = new FsFileReaderAdapter(filePath);
  } catch (error) {
    console.error(`\n❌  ${(error as Error).message}\n`);
    process.exit(1);
  }

  // Composition root del CLI: construye el orquestador con adapters concretos.
  const prisma = new PrismaService();
  await prisma.onModuleInit();
  const crypto = new NoOpCryptoService();

  try {
    const processIngesta = new ProcessIngestaUseCase(
      new IngestFileUseCase(),
      new DetectBankUseCase(new ExcelBankDetectorService()),
      new PrismaAccountRepository(prisma),
      new ValidateStructureUseCase(new ExcelStructureValidatorService()),
      new NormalizeTransactionsUseCase(new ExcelTransactionNormalizerService()),
      new PersistTransactionsUseCase(new PrismaIngestaRepository(prisma, crypto)),
      new PrismaCatalogoClasificacionRepository(prisma),
      new PrismaTransaccionBucketRepository(prisma),
      new CategorizarTransaccionUseCase(),
      new PrismaTransaccionClasificacionRepository(prisma),
    );

    const result = await processIngesta.execute({ fileReader, userId: USER_ID_FIJO });

    if (result.isFail()) {
      console.error(`\n❌  ${result.getError().message}\n`);
      process.exit(1);
    }

    const data = result.getValue();
    const totalCargos = data.transacciones.reduce((s, t) => s + t.cargo, 0);
    const totalAbonos = data.transacciones.reduce((s, t) => s + t.abono, 0);
    const cantCargos = data.transacciones.filter((t) => t.cargo > 0).length;
    const cantAbonos = data.transacciones.filter((t) => t.abono > 0).length;

    console.log('\n✅  Archivo procesado y persistido correctamente');
    console.log('─────────────────────────────────────');
    console.log(`  Nombre       : ${data.archivo.originalName}`);
    console.log(`  Extensión    : ${data.archivo.extension}`);
    console.log(`  Tamaño       : ${formatBytes(data.archivo.sizeInBytes)}`);
    console.log('  ─────────────────────────────────');
    console.log(`  Banco        : ${data.banco.banco}`);
    console.log(`  Tipo cuenta  : ${data.banco.tipoCuenta}`);
    console.log(`  N° cuenta    : ${data.banco.numeroCuenta || '(no disponible)'}`);
    console.log('  ─────────────────────────────────');
    console.log(`  Encabezados  : fila ${data.estructura.filaEncabezados}`);
    console.log(`  Filas datos  : ${data.estructura.totalFilasDatos}`);
    console.log('  ─────────────────────────────────');
    console.log(`  Ingesta ID   : ${data.ingestaId}`);
    console.log(`  Transacciones: ${data.total}`);
    console.log(`  Cargos       : ${cantCargos}  ($ ${formatCLP(totalCargos)})`);
    console.log(`  Abonos       : ${cantAbonos}  ($ ${formatCLP(totalAbonos)})`);
    console.log('─────────────────────────────────────\n');
  } finally {
    await prisma.onModuleDestroy();
  }
}

main().catch((error: unknown) => {
  console.error('\n❌  Error inesperado:', (error as Error).message);
  process.exit(1);
});
