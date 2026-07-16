import { PagedToken, PagedTokens } from './pdf-text-extractor';

/** Rango de X (en puntos PDF) que define una columna de la tabla. */
export interface RangoColumna {
  readonly col: string;
  readonly xMin: number;
  readonly xMax: number;
}

/** Una fila reconstruida: texto ya concatenado por columna, en orden X. */
export interface FilaAgrupada {
  readonly page: number;
  readonly y: number;
  readonly columnas: Readonly<Record<string, string>>;
  /**
   * Tokens de esta fila cuyo X no cayó dentro de ningún rango de
   * `rangosX` (fuera de todos los rangos, o en un hueco entre rangos no
   * contiguos). Expuestos en vez de descartados silenciosamente — pueden
   * ser montos u otros datos relevantes; el caller decide si es un error
   * (esta función es pura y no lanza).
   */
  readonly tokensSinAsignar: ReadonlyArray<PagedToken>;
}

/**
 * agruparTokens — reconstruye filas de tabla a partir de tokens posicionados.
 *
 * Dos pasos, ambos puramente geométricos (nada de reglas de negocio de
 * ningún banco):
 *   1. Agrupar tokens en filas por cercanía de Y (`toleranciaY`).
 *   2. Dentro de cada fila, repartir tokens en columnas por rango de X y
 *      concatenarlos en orden ascendente de X.
 *
 * Esto es lo único que necesita Santander para su descripción "palabra por
 * palabra": una vez que las columnas están definidas por rango de X, el
 * merge es una concatenación — no hace falta un caso especial por banco
 * (design.md decisión #4, DRY/KISS).
 *
 * Tokens cuyo X no cae en ningún rango de `rangosX` (fuera de todos los
 * rangos, o en un hueco entre rangos no contiguos) NO se descartan
 * silenciosamente: quedan expuestos en `FilaAgrupada.tokensSinAsignar`.
 * Como estos tokens pueden ser montos u otro dato relevante, perderlos sin
 * señal sería peligroso — esta función sigue siendo pura (no lanza) y es
 * el CALLER quien decide si un token sin asignar es un error.
 *
 * Pura — no conoce pdfjs, no lanza, no tiene I/O.
 */
export function agruparTokens(
  tokens: PagedTokens,
  rangosX: ReadonlyArray<RangoColumna>,
  toleranciaY: number,
): FilaAgrupada[] {
  const filas = agruparEnFilas(tokens, toleranciaY);
  return filas.map((fila) => {
    const { columnas, tokensSinAsignar } = repartirEnColumnas(
      fila.tokens,
      rangosX,
    );
    return {
      page: fila.page,
      y: fila.y,
      columnas,
      tokensSinAsignar,
    };
  });
}

interface FilaCruda {
  page: number;
  /** Y de referencia de la fila — el del primer token que la abrió. */
  y: number;
  tokens: PagedToken[];
}

function agruparEnFilas(tokens: PagedTokens, toleranciaY: number): FilaCruda[] {
  // Orden de lectura: página ascendente, luego Y descendente (el origen de
  // coordenadas de PDF es la esquina inferior izquierda — arriba de la
  // página es Y más grande).
  const ordenados = [...tokens].sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    return b.y - a.y;
  });

  const filas: FilaCruda[] = [];
  for (const token of ordenados) {
    const filaActual = filas.at(-1);
    const mismaFila =
      filaActual !== undefined &&
      filaActual.page === token.page &&
      Math.abs(filaActual.y - token.y) <= toleranciaY;

    if (mismaFila) {
      filaActual.tokens.push(token);
    } else {
      filas.push({ page: token.page, y: token.y, tokens: [token] });
    }
  }
  return filas;
}

function repartirEnColumnas(
  tokens: ReadonlyArray<PagedToken>,
  rangosX: ReadonlyArray<RangoColumna>,
): { columnas: Record<string, string>; tokensSinAsignar: PagedToken[] } {
  const columnas: Record<string, string> = {};
  const asignados = new Set<PagedToken>();
  for (const rango of rangosX) {
    // xMin inclusivo, xMax exclusivo — un token exactamente en el xMax de
    // un rango pertenece al SIGUIENTE rango (si `rangosX` es contiguo) o
    // queda sin asignar (si hay un hueco), nunca se duplica en ambos.
    const tokensDeColumna = tokens
      .filter((t) => t.x >= rango.xMin && t.x < rango.xMax)
      .sort((a, b) => a.x - b.x);
    for (const t of tokensDeColumna) asignados.add(t);
    columnas[rango.col] = tokensDeColumna
      .map((t) => t.str)
      .join(' ')
      .trim();
  }
  const tokensSinAsignar = tokens.filter((t) => !asignados.has(t));
  return { columnas, tokensSinAsignar };
}
