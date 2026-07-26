import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  envExampleDiverges,
  renderEnvExample,
} from '../src/config/env-example';

/**
 * CLI del emisor de `.env.example` (ADR-029, Slice 6).
 *
 * Uso:
 *   pnpm api env:example         -- regenera apps/api/.env.example
 *   pnpm api env:example:check   -- verifica que el archivo committeado esté
 *                                    al día (usado por CI); exit 1 si diverge
 *
 * Este archivo es SOLO el wrapper de I/O (fs + argv + exit codes) — la
 * lógica de formateo pura vive en `src/config/env-example.ts` y se testea
 * ahí vía `pnpm api test` (mismo patrón que `prisma/seed.ts`: script fuera
 * de `src/`, importa de `src/`, sin cobertura de vitest directa sobre este
 * archivo).
 */

const OUTPUT_PATH = resolve(__dirname, '..', '.env.example');

function main(): void {
  const checkMode = process.argv.includes('--check');

  if (!checkMode) {
    writeFileSync(OUTPUT_PATH, renderEnvExample(), 'utf-8');
    console.log(`✅  ${OUTPUT_PATH} regenerado.`);
    return;
  }

  if (!existsSync(OUTPUT_PATH)) {
    console.error(
      `❌  ${OUTPUT_PATH} no existe. Correr \`pnpm api env:example\` primero.`,
    );
    process.exit(1);
  }

  const committed = readFileSync(OUTPUT_PATH, 'utf-8');

  if (envExampleDiverges(committed)) {
    console.error(
      `❌  ${OUTPUT_PATH} está desactualizado respecto a src/config/env.ts.\n` +
        '   Correr `pnpm api env:example` y commitear el resultado.',
    );
    process.exit(1);
  }

  console.log(`✅  ${OUTPUT_PATH} está al día.`);
}

main();
