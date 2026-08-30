import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BancoChilePdfStrategy } from './banco-chile.strategy';
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

describe('BancoChilePdfStrategy', () => {
  const strategy = new BancoChilePdfStrategy();

  it('matches: reconoce la cartola real de Banco de Chile (PDF-01)', async () => {
    const tokens = await tokensPagina1('bancochile-cartola-test.pdf');
    expect(strategy.matches(tokens)).toBe(true);
  });

  it('extract: retorna BancoChile, CuentaCorriente y el número de cuenta del encabezado', async () => {
    const tokens = await tokensPagina1('bancochile-cartola-test.pdf');
    const detected = strategy.extract(tokens);
    expect(detected).toEqual({
      banco: BancoConocido.BancoChile,
      tipoCuenta: TipoCuentaConocido.CuentaCorriente,
      numeroCuenta: '12345678',
    });
  });

  it('matches: NO reconoce BCI (regresión — "ESTADO DE CUENTA..." decorativo de BCI coincide sin distinguir mayúsculas)', async () => {
    const tokens = await tokensPagina1('bci-cartola-test.pdf');
    expect(strategy.matches(tokens)).toBe(false);
  });

  it('matches: NO reconoce Santander (regresión — nota al pie "...estado de cuenta..." en minúsculas)', async () => {
    const tokens = await tokensPagina1('santander-cartola-test.pdf');
    expect(strategy.matches(tokens)).toBe(false);
  });

  it('matches: no reconoce BancoEstado', async () => {
    const tokens = await tokensPagina1('bancoestado-cartola-test.pdf');
    expect(strategy.matches(tokens)).toBe(false);
  });

  describe('getEstructura', () => {
    const estructura = strategy.getEstructura();

    it('banco es BancoChile', () => {
      expect(estructura.banco).toBe(BancoConocido.BancoChile);
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

    it('ignora SALDO INICIAL y SALDO FINAL en su forma real de fila (fecha + etiqueta, columnas de monto vacías)', () => {
      // Forma real de `textoFila` (fecha+descripcion+cargo+abono unidos con
      // espacios — ver pdf-normalization.ts): el saldo vive fuera de
      // `rangosX` a propósito, así que ambas columnas de monto quedan
      // vacías y dejan dos espacios finales. Verificado contra las 15
      // cartolas reales (2026-08-30, ver docblock de `filasIgnoradas`).
      expect(
        estructura.filasIgnoradas.some((r) => r.test('01/05 SALDO INICIAL  ')),
      ).toBe(true);
      expect(
        estructura.filasIgnoradas.some((r) => r.test('31/05 SALDO FINAL  ')),
      ).toBe(true);
    });

    it('NO ignora una transacción real cuya descripción CONTIENE "SALDO FINAL" como substring — el ancla exige que la fila sea SOLO fecha + etiqueta de resumen', () => {
      // Regresión del hardening del ancla: antes de anclarla, cualquier fila
      // cuyo texto CONTUVIERA "SALDO INICIAL"/"SALDO FINAL" se descartaba en
      // silencio, incluida una transacción real con más texto y un monto en
      // banda (ej. un ajuste de préstamo que arrastra esas palabras en su
      // glosa).
      const textoFilaConMontoReal = '15/05 AJUSTE SALDO FINAL PRESTAMO 45.300 ';
      expect(
        estructura.filasIgnoradas.some((r) => r.test(textoFilaConMontoReal)),
      ).toBe(false);
    });

    it('rangosX recalibrados contra 16 cartolas reales (2026-08-30): columnas de monto alineadas a la DERECHA — el x de inicio depende del ancho del monto (cargos OBSERVADOS x=[395.9, 423.1], abonos OBSERVADOS x=[472.0, 503.1])', () => {
      // Las bandas originales (cargo 390-440, abono 495-520) se midieron
      // contra un solo fixture: los abonos anchos reales (uno mediano en
      // x=481.7, uno de 8 dígitos en x=472.0) caían FUERA de [495, 520) →
      // ambas columnas de la fila quedaban vacías y el saldo (x≥548)
      // disparaba TokenSinAsignarSospechoso por fila. Los valores de la
      // sección de resumen ("SALDO DISPONIBLE A LA FECHA" en x≈543.4)
      // deben quedar FUERA de la banda abono: viven en filas sin fecha,
      // pero el margen evita anexarlos si el resumen ganara una fecha. Las
      // bandas finales [360,445)/[450,530) son DELIBERADAMENTE más anchas
      // que lo observado (margen para montos aún más anchos que los ya
      // vistos), no una copia exacta del rango medido.
      expect(estructura.rangosX).toContainEqual({
        col: 'cargo',
        xMin: 360,
        xMax: 445,
      });
      expect(estructura.rangosX).toContainEqual({
        col: 'abono',
        xMin: 450,
        xMax: 530,
      });
    });
  });
});
