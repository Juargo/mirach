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
});
