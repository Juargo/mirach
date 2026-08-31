import { PatronInvalidoError } from './patron-invalido.error';
import { MatchTypeInvalidoError } from './match-type-invalido.error';
import { RegexInvalidaError } from './regex-invalida.error';
import { PrioridadInvalidaError } from './prioridad-invalida.error';
import { PatronDuplicadoError } from './patron-duplicado.error';

/**
 * Unión de "forma o duplicado" para un patrón individual dentro de un lote.
 * Deliberadamente NO importa `PatronFormatoError` de
 * `application/use-cases/validar-patron.ts` — `domain` no puede depender de
 * `application` (regla de dependencias, ADR-005). Esta unión es
 * estructuralmente idéntica a `PatronFormatoError | PatronDuplicadoError`;
 * mantenerla acá, con las mismas 5 clases, es la duplicación aceptada por
 * la regla de capas, no un drift.
 */
type CausaPatronEnLote =
  | PatronInvalidoError
  | MatchTypeInvalidoError
  | RegexInvalidaError
  | PrioridadInvalidaError
  | PatronDuplicadoError;

/**
 * PatronEnLoteInvalidoError — error de dominio (envoltorio, design.md D-03).
 *
 * Se produce cuando uno de los `patrones[]` anidados enviados a
 * `POST /api/categorias` (US-038, CAT038-10/11) falla su validación de
 * forma o resulta duplicado — sea contra otro patrón del MISMO lote
 * (Set en memoria, case-insensitive) o contra un patrón que el usuario ya
 * posee (`existePatron`). `indice` es la posición CERO-based dentro del
 * array `patrones` enviado, para que el cliente pueda señalar la fila
 * ofensora exacta.
 *
 * La `causa` es SIEMPRE una de las variantes de error de forma/duplicado ya
 * mapeadas por `aCatalogoHttpError` (`PatronFormatoError | PatronDuplicadoError`)
 * — este wrapper nunca introduce un `code` nuevo (CAT038-11, "no new error
 * code"). No puede envolver a otro `PatronEnLoteInvalidoError` — la
 * recursión termina POR TIPO.
 */
export class PatronEnLoteInvalidoError extends Error {
  readonly indice: number;
  readonly causa: CausaPatronEnLote;

  constructor(indice: number, causa: CausaPatronEnLote) {
    super(causa.message);
    this.name = 'PatronEnLoteInvalidoError';
    this.indice = indice;
    this.causa = causa;
  }
}
