import { appLogger } from './app-logger';

/**
 * logDemoGateTrip — observabilidad transversal del gate demo (issue #507,
 * ADR-033).
 *
 * Único punto de logging para las 3 familias `*DemoSoloLecturaError`
 * (perfil, catálogo, ingesta) — antes del issue #507 ninguna disparaba un
 * log, así que un bypass del gate (fail-open o legítimo) era invisible en
 * producción. Se llama desde cada route handler que traduce un
 * `*DemoSoloLecturaError` a `403 DEMO_SOLO_LECTURA`, nunca desde los use
 * cases: el `path` es un concepto HTTP y los use cases son
 * transporte-agnósticos (mismo principio que `ValidarSesionUseCase`).
 *
 * `appLogger` (no DI de `ILogger`) porque este es un sitio de infraestructura
 * HTTP sin acceso a un `ILogger` inyectado por constructor — mismo
 * precedente que `sessionMiddleware` (ver `app-logger.ts`).
 *
 * Shape fijo `{ path }` — NUNCA montos ni PII (ADR-013): `path` puede incluir
 * un `:id` de recurso (p. ej. `/api/categorias/cat-1`), que es un ID interno,
 * no un dato personal (mismo razonamiento que `eliminar-ingesta.use-case.ts`
 * logueando `ingestaId`).
 */
export function logDemoGateTrip(path: string): void {
  appLogger.warn('Gate demo: escritura rechazada (DEMO_SOLO_LECTURA)', {
    path,
  });
}
