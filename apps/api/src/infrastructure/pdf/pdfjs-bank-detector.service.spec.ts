import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PdfjsBankDetectorService } from './pdfjs-bank-detector.service';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { BancoNoReconocidoError } from '../../domain/errors/banco-no-reconocido.error';
import { PdfInvalidoError } from '../../domain/errors/pdf-invalido.error';
import { PdfSinTextoError } from '../../domain/errors/pdf-sin-texto.error';
import { PdfProtegidoError } from '../../domain/errors/pdf-protegido.error';

// Debe coincidir EXACTAMENTE con `PASSWORD_FIXTURE` en
// `test/fixtures/pdf/generar-protegida-test.ts`. No se importa ese módulo
// directamente (efecto colateral: reescribe el fixture binario en cada corrida).
const PASSWORD_FIXTURE = 'clave-fixture-pdf-protegido-2026'; // gitleaks:allow — fixture de test, no es un secreto

const fixturesDir = join(__dirname, '../../../test/fixtures/pdf');

describe('PdfjsBankDetectorService', () => {
  const service = new PdfjsBankDetectorService();

  it.each([
    ['bancoestado-cartola-test.pdf', BancoConocido.BancoEstado],
    ['bancochile-cartola-test.pdf', BancoConocido.BancoChile],
    ['santander-cartola-test.pdf', BancoConocido.Santander],
    ['bci-cartola-test.pdf', BancoConocido.BCI],
  ])(
    'detecta %s como %s (PDF-01 escenario "cada fixture detectado como su banco")',
    async (archivo, bancoEsperado) => {
      const buffer = await readFile(join(fixturesDir, archivo));

      const result = await service.detect(buffer, archivo);

      expect(result.isOk()).toBe(true);
      expect(result.getValue().banco).toBe(bancoEsperado);
    },
  );

  it('retorna Fail(BancoNoReconocidoError) para un PDF con texto pero sin ningún ancla bancaria', async () => {
    const buffer = await readFile(join(fixturesDir, 'no-banco-test.pdf'));

    const result = await service.detect(buffer, 'no-banco-test.pdf');

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(BancoNoReconocidoError);
  });

  it('retorna Fail(PdfSinTextoError) para un PDF válido sin texto extraíble', async () => {
    const buffer = await readFile(join(fixturesDir, 'sin-texto-test.pdf'));

    const result = await service.detect(buffer, 'sin-texto-test.pdf');

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PdfSinTextoError);
  });

  it('retorna Fail(PdfInvalidoError) para un buffer corrupto/no-PDF, sin colgar el proceso', async () => {
    const buffer = Buffer.from('esto no es un pdf, son bytes cualquiera');

    const result = await service.detect(buffer, 'corrupto.pdf');

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PdfInvalidoError);
  });

  it('el mensaje de BancoNoReconocidoError no interpola texto crudo del PDF (solo el nombre de archivo)', async () => {
    const buffer = await readFile(join(fixturesDir, 'no-banco-test.pdf'));

    const result = await service.detect(buffer, 'no-banco-test.pdf');

    expect(result.isFail()).toBe(true);
    expect(result.getError().message).not.toContain(
      'Documento generico sin datos bancarios',
    );
    expect(result.getError().message).toContain('no-banco-test.pdf');
  });

  describe('password forwarding al extractor (D-01/D-04)', () => {
    it('sin password, PDF protegido → Fail(PdfProtegidoError "requiere-password")', async () => {
      const buffer = await readFile(join(fixturesDir, 'protegida-test.pdf'));

      const result = await service.detect(buffer, 'protegida-test.pdf');

      expect(result.isFail()).toBe(true);
      const error = result.getError();
      expect(error).toBeInstanceOf(PdfProtegidoError);
      expect((error as PdfProtegidoError).motivo).toBe('requiere-password');
    });

    it('con password incorrecta → Fail(PdfProtegidoError "password-incorrecta")', async () => {
      const buffer = await readFile(join(fixturesDir, 'protegida-test.pdf'));

      const result = await service.detect(
        buffer,
        'protegida-test.pdf',
        'esta-password-es-incorrecta',
      );

      expect(result.isFail()).toBe(true);
      const error = result.getError();
      expect(error).toBeInstanceOf(PdfProtegidoError);
      expect((error as PdfProtegidoError).motivo).toBe('password-incorrecta');
    });

    it('forwarda la password correcta al extractor — el PDF se desbloquea (deja de fallar con PdfProtegidoError)', async () => {
      const buffer = await readFile(join(fixturesDir, 'protegida-test.pdf'));

      const result = await service.detect(
        buffer,
        'protegida-test.pdf',
        PASSWORD_FIXTURE,
      );

      // El fixture no tiene estructura de ningún banco real — falla en el
      // matching de estrategias, NO en la extracción. Eso es justamente la
      // prueba de forwarding: si la password NO se hubiese pasado, el
      // resultado seguiría siendo PdfProtegidoError.
      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(BancoNoReconocidoError);
    });
  });
});
