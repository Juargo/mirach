import { SystemReloj } from './system-reloj';

describe('SystemReloj', () => {
  it('ahora() retorna la hora actual del sistema', () => {
    const reloj = new SystemReloj();

    const antes = Date.now();
    const resultado = reloj.ahora();
    const despues = Date.now();

    expect(resultado.getTime()).toBeGreaterThanOrEqual(antes);
    expect(resultado.getTime()).toBeLessThanOrEqual(despues);
  });
});
