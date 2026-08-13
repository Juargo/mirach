import { VinculacionGoogleFallidaError } from './vinculacion-google-fallida.error';

describe('VinculacionGoogleFallidaError', () => {
  it.each([
    'usuario-inexistente',
    'usuario-demo',
    'identidad-de-otra-cuenta',
    'ya-tiene-otro-sub',
    'link-perdio-la-carrera',
  ] as const)(
    'motivo "%s": el nombre del error es VinculacionGoogleFallidaError, el mensaje es fijo (AUTH-15-style, nunca cruza HTTP)',
    (motivo) => {
      const error = new VinculacionGoogleFallidaError(motivo);
      expect(error.name).toBe('VinculacionGoogleFallidaError');
      expect(error.motivo).toBe(motivo);
    },
  );

  it('el mensaje es idéntico entre motivos distintos — motivo existe solo para logging server-side', () => {
    const a = new VinculacionGoogleFallidaError('usuario-inexistente');
    const b = new VinculacionGoogleFallidaError('ya-tiene-otro-sub');
    expect(a.message).toBe(b.message);
  });
});
