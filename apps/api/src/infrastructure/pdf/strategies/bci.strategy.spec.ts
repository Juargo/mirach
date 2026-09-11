import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BciPdfStrategy } from './bci.strategy';
import { PdfTextExtractor, PagedTokens } from '../pdf-text-extractor';
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

    it('rangosX ensanchado 2026-09-10 (change SDD `bci-cartola-variante`, D-02/D-03) para cubrir ambas variantes publicadas de cartola sin dejar de cubrir la original (15 cartolas reales, 2026-08-30)', () => {
      // ÚNICA expectativa pre-existente que este change tiene permitido
      // reescribir (design.md D-01, tripwire 1) — y solo junto con la
      // justificación escrita de la tabla de D-02: fecha 35→30 (V2 mide
      // 33.6, fuera de la banda anterior), descripcion 145→130 (V2: 134.8),
      // cargo.xMax 430→440 (V2: hasta 434.1), abono.xMin 435→450 / xMax
      // 500→515 (V2: 484.4-486.6, banda angosta con solo 2 muestras). El
      // dead zone [440,450) entre cargo y abono es deliberado — ver la
      // invariante en el describe de más abajo.
      expect(estructura.rangosX).toEqual([
        { col: 'fecha', xMin: 30, xMax: 85 },
        { col: 'descripcion', xMin: 130, xMax: 320 },
        { col: 'cargo', xMin: 360, xMax: 440 },
        { col: 'abono', xMin: 450, xMax: 515 },
      ]);
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
  });
});
