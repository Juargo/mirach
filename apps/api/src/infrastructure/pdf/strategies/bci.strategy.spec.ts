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

    it('rangosX recalibrados contra 15 cartolas reales (2026-08-30): columnas de monto alineadas a la DERECHA — el x de inicio depende del ancho del monto (cargos observados x=[381.1, 409.7], abonos x=[455.3, 476.6])', () => {
      // Las bandas originales (cargo 395-420, abono 460-500) se midieron
      // contra un único fixture con montos chicos: un cargo de 8 dígitos
      // ("10.000.000") arranca en x≈381 y un abono de 7 dígitos en x≈459,
      // ambos FUERA de esas bandas → TokenSinAsignarSospechoso por fila.
      expect(estructura.rangosX).toEqual([
        { col: 'fecha', xMin: 35, xMax: 85 },
        { col: 'descripcion', xMin: 145, xMax: 320 },
        { col: 'cargo', xMin: 360, xMax: 430 },
        { col: 'abono', xMin: 435, xMax: 500 },
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

    it('el ancla de período extrae ambas fechas del mismo token de valor (separador "-")', () => {
      const texto = 'PERIODO 01-04-2026 al 30-04-2026';
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
});
