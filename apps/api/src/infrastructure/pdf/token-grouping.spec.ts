import { agruparTokens, anchoEstimado, RangoColumna } from './token-grouping';
import { PagedToken } from './pdf-text-extractor';
import { BciPdfStrategy } from './strategies/bci.strategy';
import { BancoChilePdfStrategy } from './strategies/banco-chile.strategy';
import { BancoEstadoPdfStrategy } from './strategies/banco-estado.strategy';
import { SantanderPdfStrategy } from './strategies/santander.strategy';

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

// Slice 3a (AMENDMENT A-01, design.md AD-01/AD-02) — estimador de ancho +
// pasada de rescate por borde derecho. Ninguna estrategia real opta todavía
// (eso es Slice 3b, Phase 40): esta sección solo prueba el mecanismo en
// aislamiento con columnas sintéticas (Phase 39.1/39.3) y que las 4
// estrategias reales siguen sin declarar el campo (Phase 39.6).
describe('anchoEstimado — estimador de ancho por tabla de advances Helvetica/Arial (AD-02)', () => {
  it('suma el advance de cada dígito (sin separadores): "123" a 6pt = 3 × 0.556 × 6', () => {
    expect(anchoEstimado('123', 6)).toBeCloseTo(3 * 0.556 * 6, 6);
  });

  it('incluye el advance del período ("."): "1.234" a 6pt suma 4 dígitos + 1 período', () => {
    const esperado = 4 * 0.556 * 6 + 1 * 0.278 * 6;
    expect(anchoEstimado('1.234', 6)).toBeCloseTo(esperado, 6);
  });

  it('devuelve null si ALGÚN carácter no está en la tabla — la frontera de lo medible (eligibility gate, AD-02)', () => {
    expect(anchoEstimado('12a', 6)).toBeNull();
  });
});

describe('agruparTokens — rescate por borde derecho (rescateBordeDerecho, AD-01, opt-in por columna)', () => {
  const columnasConRescate: ReadonlyArray<RangoColumna> = [
    { col: 'A', xMin: 0, xMax: 50 },
    // Hueco deliberado [50,100) — ninguna columna lo cubre por borde
    // izquierdo. `B` declara una ventana de rescate por borde derecho.
    {
      col: 'B',
      xMin: 100,
      xMax: 150,
      rescateBordeDerecho: { xMin: 60, xMax: 66, tamanoFuentePt: 6 },
    },
  ];

  it('rescata un token del hueco cuyo borde derecho estimado cae dentro de la ventana declarada (Phase 39.3)', () => {
    // '9' (1 dígito) a 6pt: ancho estimado = 0.556 × 6 = 3.336.
    // x=60 -> borde derecho estimado = 63.336, dentro de [60, 66).
    const tokenRescatable = token('9', 60, 100);
    const tokens: PagedToken[] = [tokenRescatable];

    const filas = agruparTokens(tokens, columnasConRescate, 2);

    expect(filas[0].columnas.B).toBe('9');
    expect(filas[0].tokensSinAsignar).toEqual([]);
  });

  it('NO rescata un token cuyo borde derecho estimado cae fuera de la ventana declarada', () => {
    // x=55 (dentro del hueco [50,100), fuera de A y B por borde izquierdo)
    // -> borde derecho estimado = 58.336, fuera de la ventana [60, 66).
    const tokenLejos = token('9', 55, 100);
    const tokens: PagedToken[] = [tokenLejos];

    const filas = agruparTokens(tokens, columnasConRescate, 2);

    expect(filas[0].columnas.B).toBe('');
    expect(filas[0].tokensSinAsignar).toEqual([tokenLejos]);
  });

  it('NO rescata un token cuyo ancho no es medible (anchoEstimado === null): el gate de elegibilidad es la tabla, no un rango de X', () => {
    // 'a' no está en ANCHOS_GLIFO_1000EM -> anchoEstimado devuelve null,
    // aunque el token esté geométricamente cerca de la ventana declarada.
    const tokenNoMedible = token('9a', 60, 100);
    const tokens: PagedToken[] = [tokenNoMedible];

    const filas = agruparTokens(tokens, columnasConRescate, 2);

    expect(filas[0].columnas.B).toBe('');
    expect(filas[0].tokensSinAsignar).toEqual([tokenNoMedible]);
  });

  it('una columna que NO declara rescateBordeDerecho no rescata nada — comportamiento actual, sin cambios', () => {
    const columnasSinRescate: ReadonlyArray<RangoColumna> = [
      { col: 'A', xMin: 0, xMax: 50 },
      { col: 'B', xMin: 100, xMax: 150 },
    ];
    const tokenEnHueco = token('9', 60, 100);
    const tokens: PagedToken[] = [tokenEnHueco];

    const filas = agruparTokens(tokens, columnasSinRescate, 2);

    expect(filas[0].columnas.B).toBe('');
    expect(filas[0].tokensSinAsignar).toEqual([tokenEnHueco]);
  });

  it('un token ya asignado por borde izquierdo en OTRA columna no es candidato a rescate (la pasada 2 solo mira tokensSinAsignar)', () => {
    // x=20 cae dentro de A (borde izquierdo), aunque su borde derecho
    // estimado también caería dentro de la ventana de rescate de B.
    const tokenYaAsignado = token('9', 20, 100);
    const tokens: PagedToken[] = [tokenYaAsignado];

    const filas = agruparTokens(tokens, columnasConRescate, 2);

    expect(filas[0].columnas.A).toBe('9');
    expect(filas[0].columnas.B).toBe('');
    expect(filas[0].tokensSinAsignar).toEqual([]);
  });
});

describe('agruparTokens — regresión: ninguna estrategia real declara rescateBordeDerecho todavía (Slice 3a, Phase 39.6)', () => {
  it.each([
    ['BCI', new BciPdfStrategy()],
    ['Banco de Chile', new BancoChilePdfStrategy()],
    ['BancoEstado', new BancoEstadoPdfStrategy()],
    ['Santander', new SantanderPdfStrategy()],
  ] as const)(
    '%s: ninguna columna de rangosX declara rescateBordeDerecho — el mecanismo está dormido, cero opt-in (AD-01)',
    (_nombre, strategy) => {
      const { rangosX } = strategy.getEstructura();
      for (const rango of rangosX) {
        expect(rango.rescateBordeDerecho).toBeUndefined();
      }
    },
  );
});
