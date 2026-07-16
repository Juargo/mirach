import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PdfjsBankDetectorService } from './pdfjs-bank-detector.service';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { BancoNoReconocidoError } from '../../domain/errors/banco-no-reconocido.error';
import { PdfInvalidoError } from '../../domain/errors/pdf-invalido.error';
import { PdfSinTextoError } from '../../domain/errors/pdf-sin-texto.error';

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
});
