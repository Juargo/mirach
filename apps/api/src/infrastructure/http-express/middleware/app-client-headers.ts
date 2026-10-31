import type { IncomingHttpHeaders } from 'node:http';
import {
  parsearPlataformaApp,
  type PlataformaApp,
} from '../../../domain/value-objects/plataforma-app';
import { VersionApp } from '../../../domain/value-objects/version-app';

/** Headers the native apps send on every request (#116). */
export const APP_VERSION_HEADER = 'x-app-version';
export const APP_PLATFORM_HEADER = 'x-app-platform';

export interface AppClientLogProps {
  appVersion?: string;
  appPlatform?: PlataformaApp;
}

/**
 * The app version and platform as safe log fields (ADR-011). Only a value that
 * passes the domain validation is kept — the platform from its allowlist, the
 * version as a bounded MAJOR.MINOR.PATCH — so arbitrary header text never
 * reaches the logs. Missing or invalid values are simply omitted.
 */
export function appClientLogProps(
  headers: IncomingHttpHeaders,
): AppClientLogProps {
  const props: AppClientLogProps = {};
  const version = headers[APP_VERSION_HEADER];
  if (typeof version === 'string') {
    const parsed = VersionApp.crear(version);
    if (parsed.isOk()) props.appVersion = parsed.getValue().toString();
  }
  const platform = headers[APP_PLATFORM_HEADER];
  if (typeof platform === 'string') {
    const parsed = parsearPlataformaApp(platform);
    if (parsed.isOk()) props.appPlatform = parsed.getValue();
  }
  return props;
}
