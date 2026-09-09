import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, vi } from 'vitest';
import { PdfTextExtractor } from './pdf-text-extractor';
import { PdfInvalidoError } from '../../domain/errors/pdf-invalido.error';
import { PdfSinTextoError } from '../../domain/errors/pdf-sin-texto.error';
import { PdfProtegidoError } from '../../domain/errors/pdf-protegido.error';

const fixturesDir = join(__dirname, '../../../test/fixtures/pdf');

// Debe coincidir EXACTAMENTE con `PASSWORD_FIXTURE` en
// `test/fixtures/pdf/generar-protegida-test.ts`. No se importa ese módulo
// directamente porque tiene un efecto secundario de módulo (regenera el
// fixture en disco al cargarse) — no deseable como side-effect de un
// import en un archivo de test.
const PASSWORD_FIXTURE = 'clave-fixture-pdf-protegido-2026'; // gitleaks:allow — fixture de test, no es un secreto

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

  describe('PDF protegido con password (D-04)', () => {
    // Constant-pin / alarm test: si un upgrade de pdfjs-dist cambia la forma
    // de PasswordResponses, este test falla RUIDOSAMENTE señalando a la
    // librería, no a nuestro código (design.md D-04).
    it('PasswordResponses.NEED_PASSWORD y .INCORRECT_PASSWORD son numéricos y distintos', async () => {
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

      expect(typeof pdfjsLib.PasswordResponses.NEED_PASSWORD).toBe('number');
      expect(typeof pdfjsLib.PasswordResponses.INCORRECT_PASSWORD).toBe(
        'number',
      );
      expect(pdfjsLib.PasswordResponses.NEED_PASSWORD).not.toBe(
        pdfjsLib.PasswordResponses.INCORRECT_PASSWORD,
      );
    });

    it('retorna Fail(PdfProtegidoError "requiere-password") sin password', async () => {
      const buffer = await readFile(join(fixturesDir, 'protegida-test.pdf'));
      const extractor = new PdfTextExtractor();

      const result = await extractor.extract(buffer, 'protegida-test.pdf');

      expect(result.isFail()).toBe(true);
      const error = result.getError();
      expect(error).toBeInstanceOf(PdfProtegidoError);
      expect((error as PdfProtegidoError).motivo).toBe('requiere-password');
    });

    it('retorna Fail(PdfProtegidoError "password-incorrecta") con password incorrecta', async () => {
      const buffer = await readFile(join(fixturesDir, 'protegida-test.pdf'));
      const extractor = new PdfTextExtractor();

      const result = await extractor.extract(
        buffer,
        'protegida-test.pdf',
        'esta-password-es-incorrecta',
      );

      expect(result.isFail()).toBe(true);
      const error = result.getError();
      expect(error).toBeInstanceOf(PdfProtegidoError);
      expect((error as PdfProtegidoError).motivo).toBe('password-incorrecta');
    });

    it('retorna Ok(tokens) con la password correcta', async () => {
      const buffer = await readFile(join(fixturesDir, 'protegida-test.pdf'));
      const extractor = new PdfTextExtractor();

      const result = await extractor.extract(
        buffer,
        'protegida-test.pdf',
        PASSWORD_FIXTURE,
      );

      expect(result.isOk()).toBe(true);
      const tokens = result.getValue();
      const texto = tokens.map((token) => token.str).join('');
      expect(texto).toBe('PDF PROTEGIDO FIXTURE');
    });

    // Negative regression (over-capture guard): un buffer corrupto (no
    // cifrado) debe seguir cayendo en PdfInvalidoError, nunca en la nueva
    // rama de detección de password.
    it('un buffer corrupto (no cifrado) sigue retornando PdfInvalidoError, no PdfProtegidoError', async () => {
      const buffer = Buffer.from(
        'esto no es un pdf, son bytes cualquiera 12345',
      );
      const extractor = new PdfTextExtractor();

      const result = await extractor.extract(buffer, 'corrupto.pdf');

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PdfInvalidoError);
    });

    // Never-leak (D-07 capa 2): el mensaje de error jamás debe contener la
    // password entregada, aunque sea incorrecta — una futura edición que
    // reenvíe el mensaje crudo de pdfjs debe hacer fallar este test.
    it('el mensaje de error nunca contiene la password entregada (D-07)', async () => {
      const buffer = await readFile(join(fixturesDir, 'protegida-test.pdf'));
      const extractor = new PdfTextExtractor();
      const passwordIncorrectaYDistintiva = 'password-incorrecta-marcador-xyz';

      const result = await extractor.extract(
        buffer,
        'protegida-test.pdf',
        passwordIncorrectaYDistintiva,
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError().message).not.toContain(
        passwordIncorrectaYDistintiva,
      );
    });
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
      const { PdfInvalidoError: PdfInvalidoErrorFresco } =
        await import('../../domain/errors/pdf-invalido.error.js');
      const extractor = new PdfTextExtractorConImportRoto();
      const buffer = Buffer.from('no llega a leerse: el import falla antes');

      const result = await extractor.extract(buffer, 'cualquiera.pdf');

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PdfInvalidoErrorFresco);
    });
  });
});
