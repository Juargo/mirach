import { DemoRateLimiter } from './demo-rate-limiter';

describe('DemoRateLimiter (DEMO-AUTH-02)', () => {
  it('no bloquea antes de alcanzar el umbral', () => {
    const limiter = new DemoRateLimiter(3, 3_600_000);

    expect(limiter.isBlocked('1.2.3.4')).toBe(false);
  });

  it('bloquea el 4to intento tras 3 fallos en la misma IP', () => {
    const limiter = new DemoRateLimiter(3, 3_600_000);
    const ip = '1.2.3.4';

    limiter.recordFailure(ip);
    limiter.recordFailure(ip);
    expect(limiter.isBlocked(ip)).toBe(false);

    limiter.recordFailure(ip);
    expect(limiter.isBlocked(ip)).toBe(true);
  });

  it('IPs distintas tienen contadores independientes', () => {
    const limiter = new DemoRateLimiter(3, 3_600_000);

    limiter.recordFailure('1.1.1.1');
    limiter.recordFailure('1.1.1.1');
    limiter.recordFailure('1.1.1.1');
    expect(limiter.isBlocked('1.1.1.1')).toBe(true);
    expect(limiter.isBlocked('2.2.2.2')).toBe(false);
  });

  it('reset limpia el contador de una IP', () => {
    const limiter = new DemoRateLimiter(3, 3_600_000);
    const ip = '1.2.3.4';

    limiter.recordFailure(ip);
    limiter.recordFailure(ip);
    limiter.recordFailure(ip);
    expect(limiter.isBlocked(ip)).toBe(true);

    limiter.reset(ip);
    expect(limiter.isBlocked(ip)).toBe(false);
  });

  it('la ventana expirada vuelve a permitir intentos', () => {
    const ahoraFake = { valor: 0 };
    const limiter = new DemoRateLimiter(3, 3_600_000, () => ahoraFake.valor);
    const ip = '1.2.3.4';

    limiter.recordFailure(ip);
    limiter.recordFailure(ip);
    limiter.recordFailure(ip);
    expect(limiter.isBlocked(ip)).toBe(true);

    ahoraFake.valor += 3_600_000 + 1;

    expect(limiter.isBlocked(ip)).toBe(false);
  });

  it('el mapa no crece sin límite: al superar maxEntries se evictan las entradas más antiguas', () => {
    // maxEntries=2 para un test rápido — cada recordFailure agrega 1 clave (solo IP).
    const limiter = new DemoRateLimiter(1, 3_600_000, Date.now, 2);

    limiter.recordFailure('1.1.1.1');
    expect(limiter.isBlocked('1.1.1.1')).toBe(true);

    limiter.recordFailure('2.2.2.2');
    expect(limiter.isBlocked('2.2.2.2')).toBe(true);

    // Un tercer fallo agrega 1 clave nueva y supera maxEntries=2 — debe
    // evictar la entrada MÁS ANTIGUA ('1.1.1.1'), no la recién insertada.
    limiter.recordFailure('3.3.3.3');

    expect(limiter.isBlocked('1.1.1.1')).toBe(false);
    expect(limiter.isBlocked('2.2.2.2')).toBe(true);
    expect(limiter.isBlocked('3.3.3.3')).toBe(true);
  });
});
