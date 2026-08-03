import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  openApiJsonDiverges,
  renderOpenApiJson,
} from '../src/infrastructure/http-express/schemas/openapi-json';

/**
 * CLI del emisor de `openapi.json` (openapi-contract-express, Slice 0).
 *
 * Uso:
 *   pnpm api openapi:emit         -- regenera apps/api/openapi.json
 *   pnpm api openapi:check        -- verifica que el archivo committeado esté
 *                                     al día (usado por CI); exit 1 si diverge
 *
 * Este archivo es SOLO el wrapper de I/O (fs + argv + exit codes) — la lógica
 * de serialización determinística pura vive en
 * `src/infrastructure/http-express/schemas/openapi-json.ts` y se testea ahí
 * vía `pnpm api test` (mismo patrón que `env-example.ts` / `gen-env-example.ts`).
 *
 * Nunca levanta la app (sin container/env/DB) — el job `api` de CI corre esto
 * con un `DATABASE_URL` dummy y sin Postgres real.
 */

const OUTPUT_PATH = resolve(__dirname, '..', 'openapi.json');

function main(): void {
  const checkMode = process.argv.includes('--check');

  if (!checkMode) {
    writeFileSync(OUTPUT_PATH, renderOpenApiJson(), 'utf-8');
    console.log(`✅  ${OUTPUT_PATH} regenerado.`);
    return;
  }

  if (!existsSync(OUTPUT_PATH)) {
    console.error(
      `❌  ${OUTPUT_PATH} no existe. Correr \`pnpm api openapi:emit\` primero.`,
    );
    process.exit(1);
  }

  const committed = readFileSync(OUTPUT_PATH, 'utf-8');

  if (openApiJsonDiverges(committed)) {
    console.error(
      `❌  ${OUTPUT_PATH} está desactualizado respecto a los schemas.\n` +
        '   Correr `pnpm api openapi:emit` y commitear el resultado.',
    );
    process.exit(1);
  }

  console.log(`✅  ${OUTPUT_PATH} está al día.`);
}

main();
