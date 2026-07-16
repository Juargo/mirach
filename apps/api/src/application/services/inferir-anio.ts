/**
 * inferirAnios — infiere el año de cada movimiento cuando el statement no lo
 * trae explícito (BancoEstado, Banco de Chile, Santander — BCI sí trae año
 * explícito por fila y no usa este helper, ver design.md decisión #5).
 *
 * Algoritmo: recorre los meses en el orden en que aparecen en el statement;
 * cuando un mes es MENOR al mes anterior, asume que cruzó de diciembre a
 * enero y aumenta el año en 1 (y todo lo que sigue queda en ese año nuevo,
 * hasta el próximo cruce). Meses repetidos o ascendentes no disparan el
 * incremento.
 *
 * PRECONDICIÓN (contrato del caller): `meses` debe venir en orden
 * cronológico ascendente (el orden en que ocurrieron los movimientos), no
 * necesariamente en orden numérico. Esto es intencional y NO se relaja a
 * "solo diciembre a enero" (`mesPrevio === 12 && mes === 1`) porque eso
 * fallaría cruces de año reales donde diciembre no tiene movimientos (ej.
 * noviembre a enero `[11, 1]`, o diciembre saltado `[12, 2]`) — "cualquier
 * decremento = cruce" es la regla correcta para entrada cronológicamente
 * ascendente. Si el caller viola la precondición (entrada NO cronológica,
 * ej. un decremento a mitad de año como `[6, 3]`), el resultado sigue la
 * misma regla y por lo tanto es indefinido-pero-documentado (ver
 * inferir-anio.spec.ts para el comportamiento exacto pinneado en tests).
 *
 * Pura — sin I/O, sin conocer pdfjs ni ningún banco en particular.
 */
export function inferirAnios(
  meses: ReadonlyArray<number>,
  anioInicial: number,
): number[] {
  const anios: number[] = [];
  let anioActual = anioInicial;
  let mesPrevio: number | undefined;

  for (const mes of meses) {
    if (mesPrevio !== undefined && mes < mesPrevio) {
      anioActual += 1;
    }
    anios.push(anioActual);
    mesPrevio = mes;
  }

  return anios;
}
