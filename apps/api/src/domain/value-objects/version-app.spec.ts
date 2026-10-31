import { VersionApp } from './version-app';
import { VersionAppInvalidaError } from '../errors/version-app-invalida.error';

function version(raw: string): VersionApp {
  return VersionApp.crear(raw).getValue();
}

describe('VersionApp', () => {
  describe('crear(raw)', () => {
    it('acepta MAJOR.MINOR.PATCH y conserva sus partes numéricas', () => {
      const result = VersionApp.crear('1.10.3');

      expect(result.isOk()).toBe(true);
      expect(result.getValue().toString()).toBe('1.10.3');
    });

    it.each([
      '',
      '1',
      '1.2',
      '1.2.3.4',
      'v1.2.3',
      '1.2.3-beta',
      '1.2.x',
      ' 1.2.3',
      '1234567.0.0',
      '<script>',
    ])(
      'rechaza %j con VersionAppInvalidaError, sin el valor en el mensaje',
      (raw) => {
        const result = VersionApp.crear(raw);

        expect(result.isFail()).toBe(true);
        const error = result.getError();
        expect(error).toBeInstanceOf(VersionAppInvalidaError);
        // Scrubbed: the message is the same fixed text whatever the input.
        expect(error.message).toBe(new VersionAppInvalidaError().message);
      },
    );
  });

  describe('esMenorQue(otra)', () => {
    it('compara numéricamente, no como texto: 1.9.0 < 1.10.0', () => {
      expect(version('1.9.0').esMenorQue(version('1.10.0'))).toBe(true);
      expect(version('1.10.0').esMenorQue(version('1.9.0'))).toBe(false);
    });

    it('una versión igual NO es menor', () => {
      expect(version('2.3.4').esMenorQue(version('2.3.4'))).toBe(false);
    });

    it.each([
      ['1.2.3', '2.0.0'],
      ['1.2.3', '1.3.0'],
      ['1.2.3', '1.2.4'],
      ['0.9.9', '1.0.0'],
    ])('%s es menor que %s', (instalada, minima) => {
      expect(version(instalada).esMenorQue(version(minima))).toBe(true);
    });

    it.each([
      ['2.0.0', '1.9.9'],
      ['1.3.0', '1.2.9'],
      ['1.2.4', '1.2.3'],
    ])('%s NO es menor que %s', (instalada, minima) => {
      expect(version(instalada).esMenorQue(version(minima))).toBe(false);
    });
  });
});
