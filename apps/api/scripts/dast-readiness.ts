import { extractLoginToken } from '../src/infrastructure/http-express/dast/extract-login-token';

/**
 * CLI used ONLY by the `dast` CI job (dast-ci-wiring, ADR-021).
 *
 * Uso:
 *   pnpm api dast:token   -- waits for the built API (`start:prod`) to be
 *                             ready, logs in with the seeded CI user, and
 *                             prints ONLY the bearer token to stdout.
 *
 * This file is SOLO the I/O wrapper (fetch + polling + argv/env + exit
 * codes) — the pure parsing logic lives in
 * `src/infrastructure/http-express/dast/extract-login-token.ts` and is
 * tested there via `pnpm api test` (same pattern as `emit-openapi.ts` /
 * `gen-env-example.ts`: script outside `src/`, no vitest coverage on this
 * file — `vitest.config.ts` only includes `src/**\/*.spec.ts`).
 *
 * Deliberately prints ONLY the token to stdout so the workflow can capture it
 * via `$(pnpm --silent api dast:token)`. Every other message (progress,
 * errors) goes to stderr. The token itself is never logged — only echoed
 * once on the final stdout line, which the workflow immediately masks via
 * `::add-mask::` before doing anything else with it.
 */

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000';
const API_KEY = process.env.API_KEY;
const SEED_USER_EMAIL = process.env.SEED_USER_EMAIL;
const SEED_USER_PASSWORD = process.env.SEED_USER_PASSWORD;

const READINESS_TIMEOUT_MS = Number(
  process.env.DAST_READINESS_TIMEOUT_MS ?? 60_000,
);
const READINESS_INTERVAL_MS = Number(
  process.env.DAST_READINESS_INTERVAL_MS ?? 2_000,
);

function fail(message: string): never {
  console.error(`[dast-readiness] ${message}`);
  process.exit(1);
}

async function waitForReady(): Promise<void> {
  const deadline = Date.now() + READINESS_TIMEOUT_MS;

  for (;;) {
    try {
      const res = await fetch(`${API_BASE_URL}/`);
      if (res.ok) {
        console.error('[dast-readiness] API is up.');
        return;
      }
    } catch {
      // Connection refused while the server is still booting — expected, keep polling.
    }

    if (Date.now() >= deadline) {
      fail(
        `API did not become ready within ${READINESS_TIMEOUT_MS}ms (polled GET ${API_BASE_URL}/).`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, READINESS_INTERVAL_MS));
  }
}

async function login(): Promise<string> {
  if (!API_KEY || !SEED_USER_EMAIL || !SEED_USER_PASSWORD) {
    fail(
      'Missing required env vars: API_KEY, SEED_USER_EMAIL, SEED_USER_PASSWORD.',
    );
  }

  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify({
      email: SEED_USER_EMAIL,
      password: SEED_USER_PASSWORD,
    }),
  });

  if (!res.ok) {
    // Scrubbed: never print the credentials, only the HTTP status.
    fail(`Login request failed with status ${res.status}.`);
  }

  const body: unknown = await res.json();

  try {
    return extractLoginToken(body);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

async function main(): Promise<void> {
  await waitForReady();
  const token = await login();
  // The ONLY stdout line — the workflow captures this via command substitution.
  process.stdout.write(token);
}

main().catch((err) => {
  fail(err instanceof Error ? (err.stack ?? err.message) : String(err));
});
