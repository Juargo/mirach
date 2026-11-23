import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SantanderPdfStrategy } from './santander.strategy';
import { PdfTextExtractor, PagedTokens } from '../pdf-text-extractor';
import { BancoConocido } from '../../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../../domain/value-objects/tipo-cuenta';
import { Transaccion } from '../../../domain/value-objects/transaccion';
import { normalizarTransaccionesPdf } from '../pdf-normalization';

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

describe('SantanderPdfStrategy', () => {
  const strategy = new SantanderPdfStrategy();

  it('matches: reconoce la cartola real de Santander (PDF-01), pese al letter-spacing decorativo del nombre del banco', async () => {
    const tokens = await tokensPagina1('santander-cartola-test.pdf');
    expect(strategy.matches(tokens)).toBe(true);
  });

  it('extract: retorna Santander, CuentaCorriente y el número de cuenta del encabezado', async () => {
    const tokens = await tokensPagina1('santander-cartola-test.pdf');
    const detected = strategy.extract(tokens);
    expect(detected).toEqual({
      banco: BancoConocido.Santander,
      tipoCuenta: TipoCuentaConocido.CuentaCorriente,
      numeroCuenta: '0-000-12-34567-8',
    });
  });

  it('matches: NO reconoce BCI (regresión — BCI también usa la palabra "CARTOLA" repetidas veces)', async () => {
    const tokens = await tokensPagina1('bci-cartola-test.pdf');
    expect(strategy.matches(tokens)).toBe(false);
  });

  it('matches: no reconoce BancoEstado ni Banco de Chile', async () => {
    for (const archivo of [
      'bancoestado-cartola-test.pdf',
      'bancochile-cartola-test.pdf',
    ]) {
      const tokens = await tokensPagina1(archivo);
      expect(strategy.matches(tokens)).toBe(false);
    }
  });

  describe('getEstructura', () => {
    const estructura = strategy.getEstructura();

    /**
     * Geometría medida en una cartola real (2026-11-23): los montos van
     * alineados a la DERECHA en fuente monoespaciada (4,8 pt por carácter),
     * con borde derecho en x=441 (cargos) y x=523 (abonos). El X de inicio
     * del token retrocede 4,8 pt por cada carácter extra, así que la banda
     * debe cubrir desde el monto más largo esperable hasta el de 1 dígito.
     */
    describe('montos alineados a la derecha (cartola real)', () => {
      const periodo = { desde: '2026-09-30', hasta: '2026-10-30' };
      const BORDE_DERECHO = { cargo: 441, abono: 523 };
      const ANCHO_CARACTER = 4.8;

      function fila(monto: string, columna: 'cargo' | 'abono'): PagedTokens {
        const x = BORDE_DERECHO[columna] - monto.length * ANCHO_CARACTER;
        return [
          { str: '19/10 Agustinas', x: 32, y: 614, page: 1 },
          { str: 'Transf.', x: 164.8, y: 614, page: 1 },
          { str: 'Tercero', x: 203.2, y: 614, page: 1 },
          { str: '1126092', x: 327.2, y: 614, page: 1 },
          { str: monto, x, y: 614, page: 1 },
        ];
      }

      function esperada(cargo: bigint, abono: bigint): Transaccion {
        return Transaccion.crear({
          fecha: new Date(Date.UTC(2026, 9, 19)),
          descripcion: 'Transf. Tercero',
          cargo,
          abono,
        }).getValue();
      }

      it('corta la tabla en "Resumen de Comisiones" aunque llegue palabra por palabra con tokens de espacio: el eco de la última fila no se suma', () => {
        const comision = (y: number): PagedTokens => [
          { str: '28/10 Agustinas', x: 32, y, page: 1 },
          { str: 'COM.MANTENCION', x: 112, y, page: 1 },
          { str: ' ', x: 179.2, y, page: 1 },
          { str: 'PLAN', x: 184, y, page: 1 },
          { str: '3.285', x: 417, y, page: 1 },
        ];
        const tokens: PagedTokens = [
          ...comision(584),
          { str: 'Resumen', x: 112, y: 564, page: 1 },
          { str: ' ', x: 145.6, y: 564, page: 1 },
          { str: 'de', x: 150.4, y: 564, page: 1 },
          { str: ' ', x: 160, y: 564, page: 1 },
          { str: 'Comisiones', x: 164.8, y: 564, page: 1 },
          { str: '*********************', x: 112, y: 554, page: 1 },
          ...comision(544),
        ];

        const resultado = normalizarTransaccionesPdf(
          tokens,
          estructura,
          periodo,
        );

        expect(resultado.isOk()).toBe(true);
        const transacciones = resultado.getValue();
        expect(transacciones).toHaveLength(1);
        expect(transacciones[0].cargo).toBe(3285n);
        expect(transacciones[0].abono).toBe(0n);
      });

      it.each([
        ['5.000', 5000n],
        ['360.000', 360000n],
        ['1.250.000', 1250000n],
        ['9.999.999.999', 9999999999n],
      ])('abono %s se lee como abono, con cargo en 0', (monto, valor) => {
        const resultado = normalizarTransaccionesPdf(
          fila(monto, 'abono'),
          estructura,
          periodo,
        );

        expect(resultado.isOk()).toBe(true);
        expect(resultado.getValue()).toEqual([esperada(0n, valor)]);
      });

      it.each([
        ['3.285', 3285n],
        ['346.569', 346569n],
        ['12.500.000', 12500000n],
        ['9.999.999.999', 9999999999n],
      ])('cargo %s se lee como cargo, con abono en 0', (monto, valor) => {
        const resultado = normalizarTransaccionesPdf(
          fila(monto, 'cargo'),
          estructura,
          periodo,
        );

        expect(resultado.isOk()).toBe(true);
        expect(resultado.getValue()).toEqual([esperada(valor, 0n)]);
      });
    });

    it('banco es Santander', () => {
      expect(estructura.banco).toBe(BancoConocido.Santander);
    });

    it('infiere el año desde el inicio del período (formato DD/MM sin año)', () => {
      expect(estructura.formatoFecha).toBe('DD/MM');
      expect(estructura.fuenteAnio).toEqual({
        kind: 'inferido',
        desde: 'periodo-inicio',
      });
    });

    it('las 4 columnas canónicas tienen xMin < xMax', () => {
      for (const rango of estructura.rangosX) {
        expect(rango.xMin).toBeLessThan(rango.xMax);
      }
    });

    it('ignora la sección Resumen de Comisiones', () => {
      expect(
        estructura.filasIgnoradas.some((r) => r.test('Resumen de Comisiones')),
      ).toBe(true);
    });

    it('el ancla de período resuelve etiqueta y valor en filas distintas (DESDE/HASTA vs 1ª/2ª fecha)', () => {
      const texto =
        'CARTOLA DESDE HASTA PAGINA 0262-M-C-00 54 01/03/2026 31/03/2026 1 de 1';
      expect(texto.match(estructura.anclasPeriodo.desde)?.[1]).toBe(
        '01/03/2026',
      );
      expect(texto.match(estructura.anclasPeriodo.hasta)?.[1]).toBe(
        '31/03/2026',
      );
    });
  });
});
