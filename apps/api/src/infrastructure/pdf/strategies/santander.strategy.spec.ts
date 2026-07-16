import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SantanderPdfStrategy } from './santander.strategy';
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
      expect(texto.match(estructura.anclasPeriodo.desde)?.[1]).toBe('01/03/2026');
      expect(texto.match(estructura.anclasPeriodo.hasta)?.[1]).toBe('31/03/2026');
    });
  });
});
