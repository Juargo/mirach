import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PdfjsStructureValidatorService } from './pdfjs-structure-validator.service';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { EstructuraPdfInvalidaError } from '../../domain/errors/estructura-pdf-invalida.error';

// Debe coincidir EXACTAMENTE con `PASSWORD_FIXTURE` en
// `test/fixtures/pdf/generar-protegida-test.ts`. No se importa ese módulo
// directamente (efecto colateral: reescribe el fixture binario en cada corrida).
const PASSWORD_FIXTURE = 'clave-fixture-pdf-protegido-2026'; // gitleaks:allow — fixture de test, no es un secreto

const fixturesDir = join(__dirname, '../../../test/fixtures/pdf');

describe('PdfjsStructureValidatorService', () => {
  const service = new PdfjsStructureValidatorService();

  it.each([
    [
      'bancoestado-cartola-test.pdf',
      BancoConocido.BancoEstado,
      '2026-04-01',
      '2026-04-30',
    ],
    [
      'bancochile-cartola-test.pdf',
      BancoConocido.BancoChile,
      '2026-04-01',
      '2026-04-30',
    ],
    [
      'santander-cartola-test.pdf',
      BancoConocido.Santander,
      '2026-03-01',
      '2026-03-31',
    ],
    ['bci-cartola-test.pdf', BancoConocido.BCI, '2026-04-01', '2026-04-30'],
    // 2ª variante de layout de BCI (change bci-cartola-variante): ejercita el
    // ancla PERIODO tolerante al ":" (PERIODO : DD-MM-YYYY al DD-MM-YYYY) a
    // través del validate() real, end-to-end. Sin este caso, una regresión en
    // evaluarEstructura para la variante pasaría la suite en verde (WARNING de
    // sdd-verify).
    [
      'bci-cartola-variante-test.pdf',
      BancoConocido.BCI,
      '2026-06-01',
      '2026-06-30',
    ],
  ])(
    '%s valida a Result.ok con el período esperado %s–%s (PDF-02 escenario "cada fixture valida a su período esperado")',
    async (archivo, banco, desde, hasta) => {
      const buffer = await readFile(join(fixturesDir, archivo));

      const result = await service.validate(buffer, banco);

      expect(result.isOk()).toBe(true);
      const validada = result.getValue();
      expect(validada.banco).toBe(banco);
      expect(validada.periodo).toEqual({ desde, hasta });
      expect(validada.paginaInicioTabla).toBe(1);
    },
  );

  it.each([
    BancoConocido.BancoEstado,
    BancoConocido.BancoChile,
    BancoConocido.Santander,
    BancoConocido.BCI,
  ])(
    '%s: rangosX cubre las 4 columnas canónicas con xMin < xMax',
    async (banco) => {
      const archivosPorBanco: Record<string, string> = {
        [BancoConocido.BancoEstado]: 'bancoestado-cartola-test.pdf',
        [BancoConocido.BancoChile]: 'bancochile-cartola-test.pdf',
        [BancoConocido.Santander]: 'santander-cartola-test.pdf',
        [BancoConocido.BCI]: 'bci-cartola-test.pdf',
      };
      const buffer = await readFile(join(fixturesDir, archivosPorBanco[banco]));

      const result = await service.validate(buffer, banco);

      expect(result.isOk()).toBe(true);
      const { rangosX } = result.getValue();
      const columnas = rangosX.map((r) => r.col).sort();
      expect(columnas).toEqual(['abono', 'cargo', 'descripcion', 'fecha']);
      for (const rango of rangosX) {
        expect(rango.xMin).toBeLessThan(rango.xMax);
      }
    },
  );

  it('retorna Fail(EstructuraPdfInvalidaError) para un banco sin configuración', async () => {
    const buffer = await readFile(
      join(fixturesDir, 'bancoestado-cartola-test.pdf'),
    );

    // 'BancoDesconocido' no está en el Map interno del servicio.
    const result = await service.validate(
      buffer,
      'BancoDesconocido' as BancoConocido,
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EstructuraPdfInvalidaError);
  });

  it('retorna Fail(EstructuraPdfInvalidaError) para un buffer corrupto (PdfIlegible), sin colgar el proceso', async () => {
    const buffer = Buffer.from('esto no es un pdf, son bytes cualquiera');

    const result = await service.validate(buffer, BancoConocido.BancoEstado);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EstructuraPdfInvalidaError);
  });

  describe('password forwarding al extractor (D-01/D-05)', () => {
    it('sin password, PDF protegido → colapsa a EstructuraPdfInvalidaError "PdfIlegible" (masking existente)', async () => {
      const buffer = await readFile(join(fixturesDir, 'protegida-test.pdf'));

      const result = await service.validate(buffer, BancoConocido.BancoEstado);

      expect(result.isFail()).toBe(true);
      const error = result.getError() as EstructuraPdfInvalidaError;
      expect(error).toBeInstanceOf(EstructuraPdfInvalidaError);
      expect(error.problemas).toEqual([{ tipo: 'PdfIlegible' }]);
    });

    it('forwarda la password correcta al extractor — deja de colapsar en PdfIlegible (la extracción tuvo éxito)', async () => {
      const buffer = await readFile(join(fixturesDir, 'protegida-test.pdf'));

      const result = await service.validate(
        buffer,
        BancoConocido.BancoEstado,
        PASSWORD_FIXTURE,
      );

      // El fixture no tiene la estructura de ningún banco real — la
      // extracción SÍ tiene éxito (prueba del forwarding), pero
      // evaluarEstructura falla por anclas faltantes, no por PdfIlegible.
      expect(result.isFail()).toBe(true);
      const error = result.getError() as EstructuraPdfInvalidaError;
      expect(error).toBeInstanceOf(EstructuraPdfInvalidaError);
      expect(error.problemas).not.toEqual([{ tipo: 'PdfIlegible' }]);
    });
  });
});
