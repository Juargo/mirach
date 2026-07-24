/**
 * CLI — punto de entrada para ingesta de archivos bancarios desde terminal.
 *
 * Uso:
 *   pnpm cli -- ./cartola.xlsx
 *   pnpm cli -- /ruta/absoluta/movimientos.xlsx
 *   pnpm cli -- ./cartola.pdf
 *
 * Ejecuta el pipeline completo vía ProcessIngestaUseCase (detectar → asegurar
 * cuenta → validar → normalizar → persistir) — el mismo orquestador que usa el
 * endpoint HTTP. Desde ADR-028, CLI y HTTP comparten LITERALMENTE el mismo
 * composition root: `createPrismaClient` + `crearProcessIngesta`.
 */

import 'dotenv/config';
import { crearProcessIngesta } from '../../composition/crear-process-ingesta';
import { createPrismaClient } from '../persistence/create-prisma-client';
import { USER_ID_FIJO } from '../persistence/constants';
import { FsFileReaderAdapter } from './fs-file-reader.adapter';

function formatCLP(n: bigint): string {
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

  // Composition root: el MISMO que usa el HTTP (ADR-028).
  const prisma = createPrismaClient();
  await prisma.$connect();

  try {
    const processIngesta = crearProcessIngesta(prisma);

    const result = await processIngesta.execute({
      fileReader,
      userId: USER_ID_FIJO,
    });

    if (result.isFail()) {
      console.error(`\n❌  ${result.getError().message}\n`);
      process.exit(1);
    }

    const data = result.getValue();
    const totalCargos = data.transacciones.reduce((s, t) => s + t.cargo, 0n);
    const totalAbonos = data.transacciones.reduce((s, t) => s + t.abono, 0n);
    const cantCargos = data.transacciones.filter((t) => t.cargo > 0n).length;
    const cantAbonos = data.transacciones.filter((t) => t.abono > 0n).length;

    console.log('\n✅  Archivo procesado y persistido correctamente');
    console.log('─────────────────────────────────────');
    console.log(`  Nombre       : ${data.archivo.originalName}`);
    console.log(`  Extensión    : ${data.archivo.extension}`);
    console.log(`  Tamaño       : ${formatBytes(data.archivo.sizeInBytes)}`);
    console.log('  ─────────────────────────────────');
    console.log(`  Banco        : ${data.banco.banco}`);
    console.log(`  Tipo cuenta  : ${data.banco.tipoCuenta}`);
    console.log(
      `  N° cuenta    : ${data.banco.numeroCuenta || '(no disponible)'}`,
    );
    console.log('  ─────────────────────────────────');
    console.log(`  Encabezados  : fila ${data.estructura.filaEncabezados}`);
    console.log(`  Filas datos  : ${data.estructura.totalFilasDatos}`);
    console.log('  ─────────────────────────────────');
    console.log(`  Ingesta ID   : ${data.ingestaId}`);
    console.log(`  Transacciones: ${data.total}`);
    console.log(`  Duplicados   : ${data.duplicadosOmitidos} (omitidos)`);
    console.log(
      `  Cargos       : ${cantCargos}  ($ ${formatCLP(totalCargos)})`,
    );
    console.log(
      `  Abonos       : ${cantAbonos}  ($ ${formatCLP(totalAbonos)})`,
    );
    console.log('─────────────────────────────────────\n');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('\n❌  Error inesperado:', (error as Error).message);
  process.exit(1);
});
