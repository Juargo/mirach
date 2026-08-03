/**
 * extractLoginToken — parses the JSON body of `POST /api/auth/login`
 * (dast-ci-wiring, ADR-021) into the bearer token the DAST job's Schemathesis
 * and ZAP steps send as `Authorization: Bearer <token>`.
 *
 * Pure and side-effect free (no network/fs) so it is unit-testable via
 * `pnpm api test` — same pattern as `src/config/env-example.ts` and
 * `src/infrastructure/http-express/schemas/openapi-json.ts`: the thin CLI
 * wrapper that calls this (`apps/api/scripts/dast-readiness.ts`) does the I/O
 * and stays untested.
 *
 * Throws (never returns undefined) on any shape mismatch — a CI script that
 * silently continues with an empty/undefined token would authenticate
 * nothing and turn the DAST scan into a silent no-op against 401s only.
 */
export function extractLoginToken(body: unknown): string {
  const token =
    typeof body === 'object' && body !== null && 'token' in body
      ? body.token
      : undefined;

  if (typeof token !== 'string' || token.length === 0) {
    throw new Error(
      'extractLoginToken: response body is missing a non-empty "token" field ' +
        '(expected the JSON shape of POST /api/auth/login).',
    );
  }

  return token;
}
