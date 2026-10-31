import { aceptacionTerminos, VersionConsentimiento } from './consentimiento';
import { VersionConsentimientoInvalidaError } from '../errors/version-consentimiento-invalida.error';

describe('VersionConsentimiento', () => {
  it.each(['1', '2026-10-30', 'v1.2.3', 'terminos_v2', 'a'.repeat(32)])(
    'acepta %s',
    (raw) => {
      expect(VersionConsentimiento.crear(raw).getValue().valor).toBe(raw);
    },
  );

  it.each(['', ' ', '1 2', 'v1/2', 'ñ', 'a'.repeat(33), '1\n'])(
    'rechaza %j',
    (raw) => {
      expect(VersionConsentimiento.crear(raw).getError()).toBeInstanceOf(
        VersionConsentimientoInvalidaError,
      );
    },
  );
});

describe('aceptacionTerminos', () => {
  it('sin ninguna versión no hay aceptación, y no es un error', () => {
    expect(aceptacionTerminos({}).getValue()).toBeNull();
    expect(
      aceptacionTerminos({ terminos: null, privacidad: null }).getValue(),
    ).toBeNull();
  });

  it('con ambas versiones entrega la aceptación', () => {
    const aceptacion = aceptacionTerminos({
      terminos: '2026-10',
      privacidad: '2026-09',
    }).getValue();

    expect(aceptacion?.terminos.valor).toBe('2026-10');
    expect(aceptacion?.privacidad.valor).toBe('2026-09');
  });

  it.each([
    [{ terminos: '1' }],
    [{ privacidad: '1' }],
    [{ terminos: '1', privacidad: null }],
    [{ terminos: '1', privacidad: 'con espacio' }],
    [{ terminos: '', privacidad: '1' }],
  ])('una aceptación incompleta o malformada es un error: %j', (versiones) => {
    expect(aceptacionTerminos(versiones).getError()).toBeInstanceOf(
      VersionConsentimientoInvalidaError,
    );
  });
});
