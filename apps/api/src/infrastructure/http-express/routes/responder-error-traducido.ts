import type { Response } from 'express';

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
  /** Posición cero-based del patrón anidado ofensor dentro de `patrones[]`
   * (CAT038-11, `PatronEnLoteInvalidoError`) — el ÚNICO productor de este
   * campo hoy es `POST /api/categorias` con `patrones[]`. Ausente en
   * cualquier otra respuesta de error. */
  readonly indice?: number;
}

/**
 * responderErrorTraducido — ÚNICO chokepoint entre "un traductor de errores
 * produjo un {status, code, message}" y "la response HTTP sale por el
 * wire" (issue #507).
 *
 * Los traductores (`aPerfilHttpError`, `aCatalogoHttpError`, `aHttpError`,
 * `aCommitHttpError`) se mantienen PUROS (`error → {status, code, message}`,
 * sin `Request`/`Response`) — su responsabilidad sigue siendo únicamente la
 * traducción; esta función es la única que conoce el transporte HTTP.
 */
export function responderErrorTraducido(
  res: Response,
  traduccion: ErrorTraducido,
): void {
  res.status(traduccion.status).json({
    message: traduccion.message,
    ...(traduccion.code ? { code: traduccion.code } : {}),
    ...(traduccion.indice !== undefined ? { indice: traduccion.indice } : {}),
  });
}
