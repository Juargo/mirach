import type { Request, Response } from 'express';
import { logDemoGateTrip } from '../../logging/log-demo-gate-trip';

/**
 * ErrorTraducido — la forma común que devuelve CADA traductor
 * `aXHttpError` de este repo (`aPerfilHttpError`, `aCatalogoHttpError`,
 * `aHttpError`/`aCommitHttpError` de ingesta). `code` opcional porque los
 * traductores de ingesta no siempre lo traen (algunas variantes de
 * `ProcessIngestaError`/`CommitIngestaError` solo tienen `message`).
 */
export interface ErrorTraducido {
  readonly status: number;
  readonly code?: string;
  readonly message: string;
}

/**
 * responderErrorTraducido — ÚNICO chokepoint entre "un traductor de errores
 * produjo un {status, code, message}" y "la response HTTP sale por el
 * wire" (issue #507, R2-WARNING del fan-out 4R sobre el PR original).
 *
 * Antes de esto, cada uno de los 5 route files repetía el mismo bloque de 3
 * líneas `if (code === 'DEMO_SOLO_LECTURA') { logDemoGateTrip(req.path); }`
 * antes de `res.status(status).json(...)` — 13 sitios, uno por endpoint de
 * mutación. Cualquier ruta de mutación NUEVA que olvidara copiar ese bloque
 * quedaría con el gate demo silencioso otra vez. Centralizarlo acá hace que
 * "loguear el gate demo" sea IMPOSIBLE de olvidar: alcanza con llamar a esta
 * función con el resultado del traductor.
 *
 * Los traductores (`aPerfilHttpError`, `aCatalogoHttpError`, `aHttpError`,
 * `aCommitHttpError`) se mantienen PUROS (`error → {status, code, message}`,
 * sin `Request`/`Response`, sin logging) — su responsabilidad sigue siendo
 * únicamente la traducción; esta función es la única que conoce el
 * transporte HTTP y el logging. `code === 'DEMO_SOLO_LECTURA'` es el ÚNICO
 * criterio para loguear — ningún otro error dispara `logDemoGateTrip`.
 */
export function responderErrorTraducido(
  res: Response,
  req: Request,
  traduccion: ErrorTraducido,
): void {
  if (traduccion.code === 'DEMO_SOLO_LECTURA') {
    logDemoGateTrip(req.path);
  }

  res
    .status(traduccion.status)
    .json(
      traduccion.code
        ? { message: traduccion.message, code: traduccion.code }
        : { message: traduccion.message },
    );
}
