import { parsearPlataformaApp } from './plataforma-app';
import { PlataformaAppInvalidaError } from '../errors/plataforma-app-invalida.error';

describe('parsearPlataformaApp', () => {
  it.each([
    ['ios', 'ios'],
    ['iOS', 'ios'],
    ['android', 'android'],
    ['ANDROID', 'android'],
  ])('%j → %j (sin distinguir mayúsculas)', (raw, esperada) => {
    const result = parsearPlataformaApp(raw);

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toBe(esperada);
  });

  it.each(['', 'web', 'windows', 'ios ', 'i0s'])(
    'rechaza %j con PlataformaAppInvalidaError',
    (raw) => {
      const result = parsearPlataformaApp(raw);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PlataformaAppInvalidaError);
    },
  );
});
