import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Single source of truth for "what is deployed" on the API.
 *
 * `version` comes from package.json (bumped by release-please, tag
 * `api-vX.Y.Z`, ADR-030). `commit`/`ref` come from Render's auto-injected build
 * env (`RENDER_GIT_COMMIT`/`RENDER_GIT_BRANCH`); off Render they fall back to
 * "local". `builtAt` is when this process booted — on Render a deploy restarts
 * the instance, so it marks when the current version went live.
 *
 * package.json is read at runtime with `fs` (not `import`) on purpose: an
 * `import` of package.json lives outside `rootDir: src` and would fail the
 * build with TS6059. The relative path resolves identically under tsx
 * (`src/...`) and the compiled output (`dist/...`) because both mirror the same
 * depth under `apps/api`. Read once at module load — this object is a constant.
 */
const pkg = JSON.parse(
  readFileSync(join(__dirname, '../../../package.json'), 'utf8'),
) as { version: string };

export const buildInfo = {
  version: pkg.version,
  commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? 'local',
  ref: process.env.RENDER_GIT_BRANCH ?? 'local',
  builtAt: new Date().toISOString(),
} as const;
