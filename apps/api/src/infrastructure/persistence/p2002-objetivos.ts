/**
 * objetivosDeP2002 — normaliza el `meta` de un `PrismaClientKnownRequestError`
 * con código `P2002` a una lista plana de strings, para que quien discrimina
 * pueda preguntar "¿este P2002 nombra la columna/constraint X?" sin volver a
 * escribir el recorrido de `meta`.
 *
 * Las TRES formas, verificadas contra el driver adapter real de este repo
 * (`@prisma/adapter-pg`, el que arma `createPrismaClient`):
 *
 * 1. `meta.target` como `string[]` — nombres de columna. Forma clásica.
 * 2. `meta.target` como `string` — nombre del constraint (p. ej.
 *    `"Categoria_userId_bucketId_nombre_key"`). Forma histórica.
 * 3. `meta.driverAdapterError.cause.constraint.fields` (array de columnas
 *    CITADAS por Postgres: `'"nombre"'`) y/o `.originalMessage` (el texto
 *    crudo del error 23505). Prisma 7 con driver adapters NO puebla
 *    `meta.target` en absoluto — esta es la forma que llega de verdad hoy.
 *
 * Las comillas de Postgres NO se despojan: quien discrimina usa `.includes`
 * sobre cada entrada, así que `'"nombre"'.includes('nombre')` alcanza.
 *
 * Extraído (movimiento puro, sin cambio de comportamiento) del cuerpo de
 * `esCarreraDeCreacionUser` en `prisma-identidad-google.repository.ts`,
 * cuando `prisma-categoria.repository.ts` necesitó el MISMO recorrido y
 * hubiera sido la tercera copia. La POLÍTICA sobre la lista vacía NO vive
 * acá y es distinta en cada llamador — `esCarreraDeCreacionUser` la trata
 * como carrera conservadora (`true`), `prisma-categoria.repository.ts`
 * fail-closed (rethrow) — así que esta función se limita a normalizar y
 * jamás decide.
 *
 * NO lo usa el `apuntaA` de `prisma-user-credential.repository.ts`, a
 * propósito: ese compara el `target` array por igualdad EXACTA de columna
 * (`target.includes(columna)`), no por substring, y colapsarlo acá cambiaría
 * su semántica en silencio.
 */
export function objetivosDeP2002(meta: unknown): string[] {
  const m = meta as
    | {
        target?: unknown;
        driverAdapterError?: {
          cause?: {
            constraint?: { fields?: unknown };
            originalMessage?: unknown;
          };
        };
      }
    | undefined
    | null;

  const objetivos: string[] = [];

  const target = m?.target;
  if (Array.isArray(target)) {
    objetivos.push(...target.filter((t): t is string => typeof t === 'string'));
  } else if (typeof target === 'string') {
    objetivos.push(target);
  }

  const fields = m?.driverAdapterError?.cause?.constraint?.fields;
  if (Array.isArray(fields)) {
    objetivos.push(...fields.filter((f): f is string => typeof f === 'string'));
  }

  const originalMessage = m?.driverAdapterError?.cause?.originalMessage;
  if (typeof originalMessage === 'string') {
    objetivos.push(originalMessage);
  }

  return objetivos;
}
