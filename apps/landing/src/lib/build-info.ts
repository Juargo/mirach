import pkg from '../../package.json';

/**
 * Single source of truth for "what is deployed" on the landing.
 *
 * `version` is what release-please writes to package.json (tag `landing-vX.Y.Z`,
 * ADR-030) — it says which release this *should* be. `commit`/`ref` are what
 * Vercel actually built, so together they pin the exact artifact serving prod.
 *
 * Evaluated once at build time (static output): on Vercel the VERCEL_GIT_*
 * vars are injected; on a local build they fall back to "local".
 */
export const buildInfo = {
  version: pkg.version,
  commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
  ref: process.env.VERCEL_GIT_COMMIT_REF ?? 'local',
  builtAt: new Date().toISOString(),
} as const;
