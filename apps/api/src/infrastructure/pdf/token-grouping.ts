import { PagedToken, PagedTokens } from './pdf-text-extractor';

/** Rango de X (en puntos PDF) que define una columna de la tabla. */
export interface RangoColumna {
  readonly col: string;
  readonly xMin: number;
  readonly xMax: number;
  /**
   * Opt-in — ventana de rescate por BORDE DERECHO estimado (design.md
   * AMENDMENT A-01, AD-01/AD-02). Presencia = opt-in; ausencia =
   * comportamiento actual, byte-idéntico. Ver `repartirEnColumnas` para la
   * mecánica de la segunda pasada.
   */
  readonly rescateBordeDerecho?: {
    /** Banda sobre el BORDE DERECHO estimado, no sobre `t.x` (borde izquierdo). */
    readonly xMin: number;
    /** [xMin, xMax), misma convención que el rango por borde izquierdo. */
    readonly xMax: number;
    /** Tamaño de fuente (pt) con el que se estima el ancho vía `anchoEstimado`. */
    readonly tamanoFuentePt: number;
  };
}

/**
 * Advances estándar Helvetica/Arial, en 1/1000 em (design.md AMENDMENT A-01,
 * AD-02). La medición del statement real que motivó esta tabla coincidió a
 * 0.01 pt con estas cifras publicadas a 6pt — no es una curva ajustada a un
 * documento, es font metrics estándar a un tamaño declarado.
 */
const ANCHOS_GLIFO_1000EM: Readonly<Record<string, number>> = {
  '0': 556,
  '1': 556,
  '2': 556,
  '3': 556,
  '4': 556,
  '5': 556,
  '6': 556,
  '7': 556,
  '8': 556,
  '9': 556,
  '.': 278,
  ',': 278,
  $: 556,
  '-': 333,
  ' ': 278,
};

/**
 * Estima el ancho total (en puntos PDF) de `str`, sumando el advance de cada
 * carácter según `ANCHOS_GLIFO_1000EM` escalado a `tamanoPt`.
 *
 * Devuelve `null` si ALGÚN carácter de `str` no está en la tabla — entonces
 * el token no es medible y NO es elegible para el rescate por borde derecho.
 * Esto NO es una regla de negocio de ningún banco: es la frontera de lo que
 * este estimador puede medir (design.md AD-02, "the eligibility gate is the
 * table itself, not a regex"). Los textos de descripción (con letras) nunca
 * son medibles con esta tabla, así que nunca son candidatos a "rescate"
 * hacia una columna de dinero — el gate cierra ese riesgo por construcción.
 */
export function anchoEstimado(str: string, tamanoPt: number): number | null {
  let total = 0;
  for (const caracter of str) {
    const advance1000em = ANCHOS_GLIFO_1000EM[caracter];
    if (advance1000em === undefined) return null;
    total += (advance1000em / 1000) * tamanoPt;
  }
  return total;
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
  const asignados = new Set<PagedToken>();

  // Pasada 1 — clasificación por borde IZQUIERDO (comportamiento original,
  // intacto). Recolecta LISTAS de tokens por columna en vez de unir de
  // inmediato: la pasada 2 (rescate) puede seguir agregando a estas mismas
  // listas antes del join final, que ahora ocurre una sola vez al cierre
  // (design.md AMENDMENT A-01, AD-01, "implementation shape").
  const tokensPorColumna = new Map<string, PagedToken[]>();
  for (const rango of rangosX) {
    // xMin inclusivo, xMax exclusivo — un token exactamente en el xMax de
    // un rango pertenece al SIGUIENTE rango (si `rangosX` es contiguo) o
    // queda sin asignar (si hay un hueco), nunca se duplica en ambos.
    const tokensDeColumna = tokens.filter(
      (t) => t.x >= rango.xMin && t.x < rango.xMax,
    );
    for (const t of tokensDeColumna) asignados.add(t);
    tokensPorColumna.set(rango.col, tokensDeColumna);
  }

  // Pasada 2 — rescate por borde DERECHO estimado (AD-01), SOLO para
  // columnas que declaran `rescateBordeDerecho` y SOLO sobre tokens que la
  // pasada 1 dejó sin asignar. Sin ninguna columna opt-in (los 4 bancos
  // reales hoy), este loop no encuentra ninguna ventana que iterar y el
  // resultado es byte-idéntico al de antes de este cambio (Phase 39.6).
  let pendientes = tokens.filter((t) => !asignados.has(t));
  for (const rango of rangosX) {
    const ventana = rango.rescateBordeDerecho;
    if (!ventana) continue;

    const rescatados: PagedToken[] = [];
    const siguenPendientes: PagedToken[] = [];
    for (const t of pendientes) {
      const ancho = anchoEstimado(t.str, ventana.tamanoFuentePt);
      const bordeDerechoEstimado = ancho === null ? null : t.x + ancho;
      const cae =
        bordeDerechoEstimado !== null &&
        bordeDerechoEstimado >= ventana.xMin &&
        bordeDerechoEstimado < ventana.xMax;
      if (cae) {
        rescatados.push(t);
        asignados.add(t);
      } else {
        siguenPendientes.push(t);
      }
    }
    if (rescatados.length > 0) {
      // Si la pasada 1 ya había llenado esta columna, el token rescatado se
      // suma a la lista: el join final produce dos tokens separados por
      // espacio, que `parsearMontoPdf` rechaza aguas abajo — falla RUIDOSO,
      // no corrompe el dato en silencio (design.md AD-01).
      const listaActual = tokensPorColumna.get(rango.col) ?? [];
      tokensPorColumna.set(rango.col, [...listaActual, ...rescatados]);
    }
    pendientes = siguenPendientes;
  }

  const columnas: Record<string, string> = {};
  for (const rango of rangosX) {
    const lista = tokensPorColumna.get(rango.col) ?? [];
    columnas[rango.col] = lista
      .slice()
      .sort((a, b) => a.x - b.x)
      .map((t) => t.str)
      .join(' ')
      .trim();
  }

  const tokensSinAsignar = tokens.filter((t) => !asignados.has(t));
  return { columnas, tokensSinAsignar };
}
