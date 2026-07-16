import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, vi } from 'vitest';
import { PdfTextExtractor } from './pdf-text-extractor';
import { PdfInvalidoError } from '../../domain/errors/pdf-invalido.error';
import { PdfSinTextoError } from '../../domain/errors/pdf-sin-texto.error';

const fixturesDir = join(__dirname, '../../../test/fixtures/pdf');

describe('PdfTextExtractor', () => {
  it('extrae tokens de texto (str/x/y/page) desde un PDF real (bancoestado)', async () => {
    const buffer = await readFile(
      join(fixturesDir, 'bancoestado-cartola-test.pdf'),
    );
    const extractor = new PdfTextExtractor();

    const result = await extractor.extract(
      buffer,
      'bancoestado-cartola-test.pdf',
    );

    expect(result.isOk()).toBe(true);
    const tokens = result.getValue();
    expect(tokens.length).toBeGreaterThan(0);
    for (const token of tokens.slice(0, 5)) {
      expect(typeof token.str).toBe('string');
      expect(typeof token.x).toBe('number');
      expect(typeof token.y).toBe('number');
      expect(typeof token.page).toBe('number');
    }
    // 2 páginas concatenadas (ver reference targets del spec PDF-03).
    expect(tokens.some((t) => t.page === 2)).toBe(true);
  });

  it('retorna Fail(PdfInvalidoError) para un buffer corrupto/no-PDF, sin colgar el proceso', async () => {
    const buffer = Buffer.from('esto no es un pdf, son bytes cualquiera 12345');
    const extractor = new PdfTextExtractor();

    const result = await extractor.extract(buffer, 'corrupto.pdf');

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PdfInvalidoError);
  });

  it('retorna Fail(PdfSinTextoError) para un PDF válido sin texto extraíble', async () => {
    const buffer = await readFile(join(fixturesDir, 'sin-texto-test.pdf'));
    const extractor = new PdfTextExtractor();

    const result = await extractor.extract(buffer, 'sin-texto-test.pdf');

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PdfSinTextoError);
  });

  describe('fallo de resolución del import dinámico de pdfjs-dist', () => {
    afterEach(() => {
      vi.doUnmock('pdfjs-dist/legacy/build/pdf.mjs');
      vi.resetModules();
    });

    it('retorna Fail(PdfInvalidoError) en vez de rechazar/lanzar cuando el import() dinámico falla', async () => {
      // Simula el módulo ESM-only no resolviendo (build roto, paquete
      // faltante, etc) — este `import()` vive DENTRO del try/catch de
      // `extract()`, así que su fallo debe traducirse a Result.fail igual
      // que cualquier otro fallo de carga (nunca debe rechazar la promesa
      // de `extract()` ni propagar la excepción cruda).
      vi.resetModules();
      vi.doMock('pdfjs-dist/legacy/build/pdf.mjs', () => {
        throw new Error('resolución de módulo simulada como rota');
      });

      // `resetModules` fuerza recargar todo el grafo de dependencias, así
      // que también reimportamos `PdfInvalidoError` desde ESE mismo grafo
      // fresco — comparar con la clase importada estáticamente arriba
      // fallaría el `instanceof` por identidad de módulo duplicada, no por
      // un bug real del código bajo prueba.
      const { PdfTextExtractor: PdfTextExtractorConImportRoto } =
        await import('./pdf-text-extractor.js');
      const { PdfInvalidoError: PdfInvalidoErrorFresco } = await import(
        '../../domain/errors/pdf-invalido.error.js'
      );
      const extractor = new PdfTextExtractorConImportRoto();
      const buffer = Buffer.from('no llega a leerse: el import falla antes');

      const result = await extractor.extract(buffer, 'cualquiera.pdf');

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PdfInvalidoErrorFresco);
    });
  });
});
