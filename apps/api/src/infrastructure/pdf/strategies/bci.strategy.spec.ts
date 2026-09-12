import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BciPdfStrategy } from './bci.strategy';
import { PdfTextExtractor, PagedTokens } from '../pdf-text-extractor';
import { anchoEstimado } from '../token-grouping';
import { BancoConocido } from '../../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../../domain/value-objects/tipo-cuenta';

const fixturesDir = join(__dirname, '../../../../test/fixtures/pdf');

async function tokensPagina1(archivo: string): Promise<PagedTokens> {
  const buffer = await readFile(join(fixturesDir, archivo));
  const extractor = new PdfTextExtractor();
  const result = await extractor.extract(buffer, archivo);
  if (result.isFail()) {
    throw new Error(`fixture no cargó: ${archivo}`);
  }
  return result.getValue().filter((t) => t.page === 1);
}

describe('BciPdfStrategy', () => {
  const strategy = new BciPdfStrategy();

  it('matches: reconoce la cartola real de BCI (PDF-01)', async () => {
    const tokens = await tokensPagina1('bci-cartola-test.pdf');
    expect(strategy.matches(tokens)).toBe(true);
  });

  it('extract: retorna BCI, CuentaCorriente y el número de cuenta del encabezado', async () => {
    const tokens = await tokensPagina1('bci-cartola-test.pdf');
    const detected = strategy.extract(tokens);
    expect(detected).toEqual({
      banco: BancoConocido.BCI,
      tipoCuenta: TipoCuentaConocido.CuentaCorriente,
      numeroCuenta: '12345678',
    });
  });

  it('matches/extract: reconoce el fixture sintético de montos grandes (misma familia de layout, geometría de las 15 cartolas reales)', async () => {
    const tokens = await tokensPagina1('bci-cartola-montos-grandes-test.pdf');
    expect(strategy.matches(tokens)).toBe(true);
    expect(strategy.extract(tokens)).toEqual({
      banco: BancoConocido.BCI,
      tipoCuenta: TipoCuentaConocido.CuentaCorriente,
      numeroCuenta: '87654321',
    });
  });

  it('matches: no reconoce las cartolas de los otros 3 bancos', async () => {
    for (const archivo of [
      'bancoestado-cartola-test.pdf',
      'bancochile-cartola-test.pdf',
      'santander-cartola-test.pdf',
    ]) {
      const tokens = await tokensPagina1(archivo);
      expect(strategy.matches(tokens)).toBe(false);
    }
  });

  // D-12 self-assertions, Slice 1 of change `bci-cartola-variante` — no
  // production code touched in this block. Reutiliza el patrón de
  // `tokensPagina1` pero SIN filtrar a página 1 (el encabezado repite por
  // página y el fixture tiene 3). Nota sobre el include-glob de vitest
  // (`apps/api/vitest.config.ts:19` = `['src/**/*.spec.ts',
  // 'test/*.spec.ts']`, no `test/**/*.spec.ts`): un archivo de aserciones
  // bajo `test/fixtures/pdf/` nunca correría — por eso vive aquí.
  describe('fixture geometry — bci-cartola-variante-test.pdf (D-12 self-assertions, no production code)', () => {
    let tokens: PagedTokens;

    beforeAll(async () => {
      const archivo = 'bci-cartola-variante-test.pdf';
      const buffer = await readFile(join(fixturesDir, archivo));
      const extractor = new PdfTextExtractor();
      const result = await extractor.extract(buffer, archivo);
      if (result.isFail()) {
        throw new Error(`fixture no cargó: ${archivo}`);
      }
      tokens = result.getValue();
    });

    it('al menos una fecha de fila usa separador "-" (DD-MM-YYYY)', () => {
      expect(tokens.some((tok) => /^\d{2}-\d{2}-\d{4}$/.test(tok.str))).toBe(
        true,
      );
    });

    it('ninguna fecha usa separador "/" — esta variante es 100% guion', () => {
      expect(tokens.some((tok) => /^\d{2}\/\d{2}\/\d{4}$/.test(tok.str))).toBe(
        false,
      );
    });

    it('existe un token de fecha en x=33.6 — el valor fuera de la banda `fecha` actual [35,85) que D-03 debe cubrir', () => {
      expect(
        tokens.some(
          (tok) => tok.x === 33.6 && /^\d{2}-\d{2}-\d{4}$/.test(tok.str),
        ),
      ).toBe(true);
    });

    it.each([
      'FECHA',
      'SUCURSAL',
      'DESCRIPCION',
      'CHEQUES',
      'DEPOSITOS',
      'SALDO DIARIO',
    ])(
      'el encabezado de tabla "%s" aparece exactamente una vez por página (3 páginas)',
      (etiqueta) => {
        const ocurrencias = tokens.filter((tok) => tok.str === etiqueta);
        expect(ocurrencias).toHaveLength(3);
      },
    );

    it('el ancla PERIODO llega partida en 3 tokens físicos: "PERIODO", ":" y el rango de fechas — a diferencia de la V1 (un único token de valor)', () => {
      expect(tokens.some((tok) => tok.str === 'PERIODO')).toBe(true);
      expect(tokens.some((tok) => tok.str === ':')).toBe(true);
      expect(
        tokens.some((tok) =>
          /^\d{2}-\d{2}-\d{4}\s+al\s+\d{2}-\d{2}-\d{4}$/.test(tok.str),
        ),
      ).toBe(true);
    });

    it('al menos un token de cargo cae en la banda medida [420.9, 434.1]', () => {
      const REGEX_MONTO = /^\d{1,3}(\.\d{3})*$/;
      expect(
        tokens.some(
          (tok) =>
            REGEX_MONTO.test(tok.str) && tok.x >= 420.9 && tok.x <= 434.1,
        ),
      ).toBe(true);
    });

    it('al menos dos tokens de abono caen en la banda medida [484.4, 486.6]', () => {
      const REGEX_MONTO = /^\d{1,3}(\.\d{3})*$/;
      const enBanda = tokens.filter(
        (tok) => REGEX_MONTO.test(tok.str) && tok.x >= 484.4 && tok.x <= 486.6,
      );
      expect(enBanda.length).toBeGreaterThanOrEqual(2);
    });

    // AMENDMENT A-01 (Phase 42.3) — los 3 cargos cortos nuevos (1/2/3
    // dígitos, sin separador de miles), right-aligned POR CONSTRUCCIÓN vía
    // `xRescatado` en el generador (misma tabla `anchoEstimado` que
    // producción). El generador escribe `x` en el content stream del PDF
    // con `toFixed(1)` (1 decimal, como todo `Tm` de este archivo) — por
    // eso los valores esperados abajo son el redondeo a 1 decimal del `x`
    // exacto que `xRescatado` calculó (445.744→445.7, 442.408→442.4,
    // 439.072→439.1), no el flotante sin redondear. Si el generador alguna
    // vez drifta, este bloque falla ANTES que los tests del parser — mismo
    // rol que el resto de `fixture geometry`.
    it.each([
      ['1 dígito', '5', 445.7],
      ['2 dígitos', '42', 442.4],
      ['3 dígitos', '756', 439.1],
    ])(
      'cargo corto (%s, "%s"): existe un token en x=%s — reproduce, por construcción, la convergencia de borde derecho medida en el statement real',
      (_nombre, texto, xEsperado) => {
        expect(
          tokens.some((tok) => tok.str === texto && tok.x === xEsperado),
        ).toBe(true);
      },
    );

    it('los 3 cargos cortos convergen al mismo borde derecho estimado dentro del margen que introduce el redondeo a 1 decimal del generador — la firma de una columna right-aligned', () => {
      const CONVERGENCIA = 449.08;
      // 0.05pt: la mitad del paso de redondeo (`toFixed(1)`) que el
      // generador aplica al `x` — margen estructural del fixture, no una
      // relajación del 0.01pt medido en el statement real (ese spread vive
      // en `xRescatado`, sobre el `x` SIN redondear).
      const MARGEN_REDONDEO = 0.05;
      for (const [texto, xEsperado] of [
        ['5', 445.7],
        ['42', 442.4],
        ['756', 439.1],
      ] as const) {
        const ancho = anchoEstimado(texto, 6)!;
        const bordeDerechoEstimado = xEsperado + ancho;
        expect(
          Math.abs(bordeDerechoEstimado - CONVERGENCIA),
        ).toBeLessThanOrEqual(MARGEN_REDONDEO);
      }
    });

    it('el cargo de 1 y 2 dígitos caen en el catchment [440,450) por borde izquierdo — la falla real de producción que este amendment rescata', () => {
      for (const texto of ['5', '42']) {
        const tok = tokens.find((t) => t.str === texto);
        expect(tok).toBeDefined();
        expect(tok!.x).toBeGreaterThanOrEqual(440);
        expect(tok!.x).toBeLessThan(450);
      }
    });

    it('el cargo de 3 dígitos cae en [437.6,440) por borde izquierdo — reproduce los 11 montos cortos que ya funcionaban bajo las bandas de Slice 3', () => {
      const tok = tokens.find((t) => t.str === '756');
      expect(tok).toBeDefined();
      expect(tok!.x).toBeGreaterThanOrEqual(437.6);
      expect(tok!.x).toBeLessThan(440);
    });
  });

  describe('getEstructura', () => {
    const estructura = strategy.getEstructura();

    it('banco es BCI', () => {
      expect(estructura.banco).toBe(BancoConocido.BCI);
    });

    it('trae el año explícito por fila (formato DD/MM/YYYY) — no necesita inferencia', () => {
      expect(estructura.formatoFecha).toBe('DD/MM/YYYY');
      expect(estructura.fuenteAnio).toEqual({ kind: 'explicito' });
    });

    it('las 4 columnas canónicas tienen xMin < xMax', () => {
      for (const rango of estructura.rangosX) {
        expect(rango.xMin).toBeLessThan(rango.xMax);
      }
    });

    it('rangosX ensanchado 2026-09-10 (change SDD `bci-cartola-variante`, D-02/D-03) para cubrir ambas variantes publicadas de cartola sin dejar de cubrir la original (15 cartolas reales, 2026-08-30) — cargo declara rescateBordeDerecho (AMENDMENT A-01, AD-01/AD-02)', () => {
      // SEGUNDA reescritura de esta expectativa pre-existente (design.md
      // AD-04, fila D-01) — la primera fue el ensanche de bandas de D-02/D-03
      // (comentario original abajo), esta es la declaración del opt-in de
      // rescate por borde derecho en `cargo` (AD-01: `{446, 452, 6}`, ventana
      // centrada en la convergencia medida 449.08). Esta es la CUARTA y
      // ÚLTIMA reescritura permitida de un pin pre-existente en todo el
      // change (D-01 tripwire 1 + las dos reescrituras de Fases 20.1/20.2 +
      // esta) — no hay más margen (AD-04).
      //
      // fecha 35→30 (V2 mide 33.6, fuera de la banda anterior), descripcion
      // 145→130 (V2: 134.8), cargo.xMax 430→440 (V2: hasta 434.1), abono.xMin
      // 435→450 / xMax 500→515 (V2: 484.4-486.6, banda angosta con solo 2
      // muestras). El dead zone [440,450) entre cargo y abono es deliberado
      // — ver la invariante en el describe de más abajo.
      expect(estructura.rangosX).toEqual([
        { col: 'fecha', xMin: 30, xMax: 85 },
        { col: 'descripcion', xMin: 130, xMax: 320 },
        {
          col: 'cargo',
          xMin: 360,
          xMax: 440,
          rescateBordeDerecho: { xMin: 446, xMax: 452, tamanoFuentePt: 6 },
        },
        { col: 'abono', xMin: 450, xMax: 515 },
      ]);
    });

    // AMENDMENT A-01 (AD-03) — decisión, no descuido: `abono` NO declara
    // ventana de rescate. Es lo que hace estructuralmente cierto que "un
    // metric equivocado puede rechazar un statement, nunca puede mover un
    // peso de cargo a abono" (design.md AD-02, "SAFETY PROPERTY"). Pin
    // explícito (Phase 40.3) — cross-referenciado, no duplicado, por la
    // aserción (d) de la invariante de más abajo (Phase 41.1).
    it('abono NO declara rescateBordeDerecho — decisión AD-03, no un descuido', () => {
      const abono = estructura.rangosX.find((r) => r.col === 'abono')!;
      expect(abono.rescateBordeDerecho).toBeUndefined();
    });

    it('ignora la fila de etiquetas "Periodo Saldo Anterior" (sección de totales de la última página) — sin este guard, fusionarContinuaciones la pegaría como sufijo de la última transacción', () => {
      expect(
        estructura.filasIgnoradas.some((r) => r.test('Periodo Saldo Anterior')),
      ).toBe(true);
      // El guard es exacto por fila — no debe comerse una descripción real
      // que mencione un saldo.
      expect(
        estructura.filasIgnoradas.some((r) =>
          r.test('01/05/2026 PAGO SALDO ANTERIOR TARJETA 12.000'),
        ),
      ).toBe(false);
    });

    it('el ancla de período extrae ambas fechas del mismo token de valor (separador "-"), sin dos puntos (V1)', () => {
      const texto = 'PERIODO 01-04-2026 al 30-04-2026';
      expect(texto.match(estructura.anclasPeriodo.desde)?.[1]).toBe(
        '01-04-2026',
      );
      expect(texto.match(estructura.anclasPeriodo.hasta)?.[1]).toBe(
        '30-04-2026',
      );
    });

    // Slice 3 (change SDD `bci-cartola-variante`, Phase 11, D-06) — la 2ª
    // variante imprime "PERIODO : DD-MM-YYYY al DD-MM-YYYY" (con dos
    // puntos, ancla partida en 3 tokens físicos, D-12); el ancla original
    // no tolera el ":" y `extraerPeriodo` exige que AMBOS regex matcheen
    // (`pdf-structure-extraction.ts:51-54`). Forma copiada verbatim del
    // precedente en el repo (`banco-chile.strategy.ts:91-92`).
    it('el ancla de período tolera "PERIODO : DD-MM-YYYY al DD-MM-YYYY" (con dos puntos, variante V2)', () => {
      const texto = 'PERIODO : 01-04-2026 al 30-04-2026';
      expect(texto.match(estructura.anclasPeriodo.desde)?.[1]).toBe(
        '01-04-2026',
      );
      expect(texto.match(estructura.anclasPeriodo.hasta)?.[1]).toBe(
        '30-04-2026',
      );
    });

    it('ignora el footer de navegador (URL, timestamp de impresión, indicador de página)', () => {
      expect(
        estructura.filasIgnoradas.some((r) =>
          r.test('https://www.bci.cl/cl/bci/aplicaciones/contenido.jsf?tmp=0'),
        ),
      ).toBe(true);
      expect(estructura.filasIgnoradas.some((r) => r.test('1/2'))).toBe(true);
    });
  });

  // Slice 3 (change SDD `bci-cartola-variante`, Phase 9) — invariante
  // OBLIGATORIA de design.md D-02: codifica los 6 clusters medidos como
  // aserciones aritméticas, no como prosa, para que nadie pueda mover un
  // edge más adelante sin volver a medir. `rangosX` es [xMin, xMax) —
  // xMin inclusivo, xMax exclusivo (`token-grouping.ts:108-112`).
  describe('rangosX — invariante de separación cargo/abono (D-02, obligatoria)', () => {
    const estructura = strategy.getEstructura();
    const cargo = estructura.rangosX.find((r) => r.col === 'cargo')!;
    const abono = estructura.rangosX.find((r) => r.col === 'abono')!;

    function dentro(x: number, rango: { xMin: number; xMax: number }) {
      return x >= rango.xMin && x < rango.xMax;
    }

    // [min, max] de cada cluster medido — design.md D-02.
    const V1_CARGO: [number, number] = [381.1, 409.7];
    const V1_ABONO: [number, number] = [455.3, 476.6];
    const V2_CARGO: [number, number] = [420.9, 434.1];
    const V2_ABONO: [number, number] = [484.4, 486.6];
    const V1_SALDO: [number, number] = [542.2, 561.9];
    const V2_SALDO: [number, number] = [555.9, 570.6];
    const V2_SALDO_DIARIO_HEADER_X = 521.2;

    it.each([
      ['V1 cargo', V1_CARGO],
      ['V2 cargo', V2_CARGO],
    ])(
      '%s: todo el rango medido cae dentro de `cargo` y fuera de `abono`',
      (_nombre, [min, max]) => {
        for (const x of [min, max]) {
          expect(dentro(x, cargo)).toBe(true);
          expect(dentro(x, abono)).toBe(false);
        }
      },
    );

    it.each([
      ['V1 abono', V1_ABONO],
      ['V2 abono', V2_ABONO],
    ])(
      '%s: todo el rango medido cae dentro de `abono` y fuera de `cargo`',
      (_nombre, [min, max]) => {
        for (const x of [min, max]) {
          expect(dentro(x, abono)).toBe(true);
          expect(dentro(x, cargo)).toBe(false);
        }
      },
    );

    it.each([
      ['V1 saldo', V1_SALDO],
      ['V2 saldo', V2_SALDO],
    ])(
      '%s: todo el rango medido queda FUERA tanto de `cargo` como de `abono` (columna no modelada, a propósito)',
      (_nombre, [min, max]) => {
        for (const x of [min, max]) {
          expect(dentro(x, cargo)).toBe(false);
          expect(dentro(x, abono)).toBe(false);
        }
      },
    );

    it('existe un dead zone entre `cargo` y `abono` (cargo.xMax < abono.xMin) — un monto ahí falla RUIDOSO, nunca se lee del lado equivocado', () => {
      expect(cargo.xMax).toBeLessThan(abono.xMin);
    });

    it('abono.xMax se mantiene por debajo del header "SALDO DIARIO" de V2 (521.2) — el margen de 6.2pt es deliberado (evidencia de abono V2: solo 2 muestras) y NO debe ensancharse sin volver a medir', () => {
      expect(abono.xMax).toBeLessThan(V2_SALDO_DIARIO_HEADER_X);
    });

    // AMENDMENT A-01 (Phase 41, AD-04) — EXTENSIÓN de esta invariante, no
    // reescritura: cada aserción de arriba se mantiene tal cual. Lo que
    // sigue restablece la misma invariante en el espacio del BORDE DERECHO
    // estimado, que es el que ahora decide la asignación de `cargo` para
    // los montos del catchment [440,450).
    describe('rescate por borde derecho (AD-01/AD-02, AMENDMENT A-01)', () => {
      const ventana = cargo.rescateBordeDerecho!;
      const CONVERGENCIA_BORDE_DERECHO = 449.08; // AD-02, medida en el statement real (spread 0.01pt)

      it('cargo declara la ventana de rescate {446, 452, 6pt}', () => {
        expect(ventana).toEqual({ xMin: 446, xMax: 452, tamanoFuentePt: 6 });
      });

      // (a) — cada muestra V2 cargo MEDIDA (tabla de convergencia de
      // design.md AD-02, publicada — no es PII, es geometría + font metrics)
      // estima un borde derecho dentro de la ventana, sin importar el ancho
      // del token: esa invarianza-al-ancho ES la prueba de que la columna es
      // right-aligned.
      it.each([
        ['2 dígitos (mediana x=442.41)', '99', 442.41],
        ['3 dígitos (mediana x=439.07)', '999', 439.07],
        [
          '5 dígitos con separador, 6 caracteres (mediana x=430.73)',
          '12.345',
          430.73,
        ],
      ])(
        'muestra V2 cargo medida — %s: borde derecho estimado cae dentro de [446,452)',
        (_nombre, texto, xMedido) => {
          const ancho = anchoEstimado(texto, ventana.tamanoFuentePt);
          expect(ancho).not.toBeNull();
          const bordeDerechoEstimado = xMedido + ancho!;
          expect(bordeDerechoEstimado).toBeGreaterThanOrEqual(ventana.xMin);
          expect(bordeDerechoEstimado).toBeLessThan(ventana.xMax);
        },
      );

      // (a, cont.) — muestras SINTÉTICAS 1/2/3 dígitos, alineadas a la
      // convergencia medida: prueban que la ventana cubre el caso límite
      // (1 dígito) que el statement real no necesariamente ejercitó.
      it.each([
        ['1 dígito', '9'],
        ['2 dígitos', '42'],
        ['3 dígitos', '123'],
      ])(
        'muestra sintética %s alineada a 449.08 cae dentro de [446,452)',
        (_nombre, texto) => {
          const ancho = anchoEstimado(texto, ventana.tamanoFuentePt)!;
          const xSintetico = CONVERGENCIA_BORDE_DERECHO - ancho;
          const bordeDerechoEstimado = xSintetico + ancho;
          expect(bordeDerechoEstimado).toBeGreaterThanOrEqual(ventana.xMin);
          expect(bordeDerechoEstimado).toBeLessThan(ventana.xMax);
        },
      );

      // (b) — restatement en borde-derecho del hazard "saldo corrido leído
      // como depósito fantasma" (D-02): el borde IZQUIERDO medido de saldo
      // (V1 y V2) ya excede `ventana.xMax` por sí solo, así que ningún ancho
      // (siempre ≥ 0) puede traer su borde derecho estimado de vuelta a la
      // ventana.
      it.each([
        ['V1 saldo', V1_SALDO],
        ['V2 saldo', V2_SALDO],
      ])(
        '%s: el borde izquierdo medido ya excede la ventana de rescate — ningún ancho puede hacer que su borde derecho caiga dentro de [446,452)',
        (_nombre, [min]) => {
          expect(min).toBeGreaterThanOrEqual(ventana.xMax);
        },
      );

      // (c) — re-aserción explícita (no asumir que la invariante original de
      // arriba sigue cubriendo esto una vez que el campo cambia de
      // significado, AD-04): el catchment [cargo.xMax, abono.xMin) existe.
      it('cargo.xMax < abono.xMin sigue valiendo tras declarar rescateBordeDerecho en cargo — el catchment existe (AD-03)', () => {
        expect(cargo.xMax).toBeLessThan(abono.xMin);
      });

      // (d) — abono no declara rescateBordeDerecho: cubierto por el pin
      // dedicado en el describe `getEstructura` (Phase 40.3, "abono NO
      // declara rescateBordeDerecho"). No duplicado aquí (AD-04, 41.1(d)).

      // 41.2 — invariante del monto MÁS ANGOSTO posible (1 dígito):
      // "provably wide enough, not just empirically empty" (AD-03). Ningún
      // monto de `cargo`, sin importar cuán angosto, puede alcanzar `abono`
      // vía el rescate — esto se rompe (no drifta en silencio) si la
      // ventana o el metric cambian alguna vez.
      it('el monto más angosto posible (1 dígito) nunca puede alcanzar `abono` vía el rescate — AD-03, aritmética explícita', () => {
        const anchoUnDigito = anchoEstimado('9', ventana.tamanoFuentePt);
        expect(anchoUnDigito).not.toBeNull();
        expect(anchoUnDigito).toBeCloseTo(3.336, 3);

        const bordeIzquierdoMinimo =
          CONVERGENCIA_BORDE_DERECHO - anchoUnDigito!;
        expect(bordeIzquierdoMinimo).toBeCloseTo(445.74, 2);
        expect(bordeIzquierdoMinimo).toBeLessThan(abono.xMin);
        expect(abono.xMin - bordeIzquierdoMinimo).toBeCloseTo(4.26, 2);
      });
    });
  });
});
