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

    it('el ancla de período extrae ambas fechas del mismo token de valor (separador "-")', () => {
      const texto = 'PERIODO 01-04-2026 al 30-04-2026';
      expect(texto.match(estructura.anclasPeriodo.desde)?.[1]).toBe('01-04-2026');
      expect(texto.match(estructura.anclasPeriodo.hasta)?.[1]).toBe('30-04-2026');
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
});
