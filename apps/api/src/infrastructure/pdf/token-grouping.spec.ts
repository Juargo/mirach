import { agruparTokens, RangoColumna } from './token-grouping';
import { PagedToken } from './pdf-text-extractor';

function token(str: string, x: number, y: number, page = 1): PagedToken {
  return { str, x, y, page };
}

describe('agruparTokens', () => {
  const columnasSantander: ReadonlyArray<RangoColumna> = [
    { col: 'Fecha', xMin: 0, xMax: 50 },
    { col: 'Descripcion', xMin: 50, xMax: 250 },
    { col: 'Monto', xMin: 250, xMax: 350 },
  ];

  it('mergea tokens palabra-por-palabra en una columna por rango de X (caso Santander)', () => {
    // Misma fila (Y idéntica), 5 tokens sueltos que forman la descripción.
    const tokens: PagedToken[] = [
      token('01/03', 10, 100),
      token('Transf', 60, 100),
      token('a', 115, 100),
      token('Tercero', 130, 100),
      token('Maria', 180, 100),
      token('Ejemplo', 220, 100),
      token('15.000', 280, 100),
    ];

    const filas = agruparTokens(tokens, columnasSantander, 2);

    expect(filas).toHaveLength(1);
    expect(filas[0].columnas.Fecha).toBe('01/03');
    expect(filas[0].columnas.Descripcion).toBe(
      'Transf a Tercero Maria Ejemplo',
    );
    expect(filas[0].columnas.Monto).toBe('15.000');
  });

  it('agrupa por tolerancia de Y: filas dentro de la tolerancia se mezclan, fuera se separan', () => {
    const tokens: PagedToken[] = [
      token('A', 10, 100),
      token('B', 60, 98), // dentro de tolerancia 3 respecto a 100 -> misma fila
      token('C', 10, 90), // fuera de tolerancia -> fila nueva
    ];

    const filas = agruparTokens(tokens, columnasSantander, 3);

    expect(filas).toHaveLength(2);
    expect(filas[0].columnas.Fecha).toBe('A');
    expect(filas[0].columnas.Descripcion).toBe('B');
    expect(filas[1].columnas.Fecha).toBe('C');
  });

  it('columna sin tokens en la fila queda como string vacío (no undefined)', () => {
    const tokens: PagedToken[] = [token('01/03', 10, 100)];

    const filas = agruparTokens(tokens, columnasSantander, 2);

    expect(filas[0].columnas.Descripcion).toBe('');
    expect(filas[0].columnas.Monto).toBe('');
  });

  it('preserva el orden de página: filas de la página 1 antes que las de la página 2', () => {
    const tokens: PagedToken[] = [
      token('P2', 10, 500, 2),
      token('P1', 10, 500, 1),
    ];

    const filas = agruparTokens(tokens, columnasSantander, 2);

    expect(filas.map((f) => f.page)).toEqual([1, 2]);
  });

  it('dentro de una fila, ordena los tokens de una columna por X ascendente sin importar el orden de entrada', () => {
    const tokens: PagedToken[] = [
      token('Ejemplo', 220, 100),
      token('Transf', 60, 100),
      token('Maria', 180, 100),
    ];

    const filas = agruparTokens(tokens, columnasSantander, 2);

    expect(filas[0].columnas.Descripcion).toBe('Transf Maria Ejemplo');
  });

  it('cuando todos los tokens caen dentro de algún rango, tokensSinAsignar queda vacío', () => {
    const tokens: PagedToken[] = [token('01/03', 10, 100)];

    const filas = agruparTokens(tokens, columnasSantander, 2);

    expect(filas[0].tokensSinAsignar).toEqual([]);
  });

  it('un token en el límite inferior exacto de un rango (x === xMin) cae en ESE rango', () => {
    const tokens: PagedToken[] = [token('borde', 50, 100)];

    const filas = agruparTokens(tokens, columnasSantander, 2);

    // xMin es inclusivo: 50 es el xMin de Descripcion, no el xMax de Fecha.
    expect(filas[0].columnas.Fecha).toBe('');
    expect(filas[0].columnas.Descripcion).toBe('borde');
    expect(filas[0].tokensSinAsignar).toEqual([]);
  });

  it('un token en el límite superior exacto de un rango (x === xMax) NO cae en ese rango (xMax exclusivo) y queda sin asignar si no hay rango contiguo que lo reciba', () => {
    const rangosConHueco: ReadonlyArray<RangoColumna> = [
      { col: 'A', xMin: 0, xMax: 50 },
      // Hueco deliberado: la columna B empieza en 60, no en 50.
      { col: 'B', xMin: 60, xMax: 100 },
    ];
    const tokens: PagedToken[] = [token('borde', 50, 100)];

    const filas = agruparTokens(tokens, rangosConHueco, 2);

    expect(filas[0].columnas.A).toBe('');
    expect(filas[0].columnas.B).toBe('');
    expect(filas[0].tokensSinAsignar).toEqual(tokens);
  });

  it('un token en un hueco entre rangos no contiguos queda expuesto en tokensSinAsignar, no se pierde', () => {
    const rangosConHueco: ReadonlyArray<RangoColumna> = [
      { col: 'A', xMin: 0, xMax: 50 },
      { col: 'B', xMin: 100, xMax: 150 },
    ];
    const tokenEnHueco = token('perdido', 75, 100);
    const tokens: PagedToken[] = [tokenEnHueco];

    const filas = agruparTokens(tokens, rangosConHueco, 2);

    expect(filas[0].columnas.A).toBe('');
    expect(filas[0].columnas.B).toBe('');
    expect(filas[0].tokensSinAsignar).toEqual([tokenEnHueco]);
  });

  it('tokens antes del primer rango y después del último rango quedan sin asignar', () => {
    const tokenAntes = token('antes', -10, 100);
    const tokenDespues = token('despues', 500, 100);
    const tokens: PagedToken[] = [tokenAntes, tokenDespues];

    const filas = agruparTokens(tokens, columnasSantander, 2);

    expect(filas[0].columnas.Fecha).toBe('');
    expect(filas[0].columnas.Descripcion).toBe('');
    expect(filas[0].columnas.Monto).toBe('');
    expect(filas[0].tokensSinAsignar).toEqual([tokenAntes, tokenDespues]);
  });
});
