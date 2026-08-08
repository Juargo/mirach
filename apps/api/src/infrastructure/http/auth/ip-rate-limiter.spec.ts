import { IpRateLimiter } from './ip-rate-limiter';

describe('IpRateLimiter (DEMO-AUTH-02, design §6.4 — rename de DemoRateLimiter con keyPrefix)', () => {
  it('no bloquea antes de alcanzar el umbral', () => {
    const limiter = new IpRateLimiter('demo:ip:', 3, 3_600_000);

    expect(limiter.isBlocked('1.2.3.4')).toBe(false);
  });

  it('bloquea el 4to intento tras 3 fallos en la misma IP', () => {
    const limiter = new IpRateLimiter('demo:ip:', 3, 3_600_000);
    const ip = '1.2.3.4';

    limiter.recordFailure(ip);
    limiter.recordFailure(ip);
    expect(limiter.isBlocked(ip)).toBe(false);

    limiter.recordFailure(ip);
    expect(limiter.isBlocked(ip)).toBe(true);
  });

  it('IPs distintas tienen contadores independientes', () => {
    const limiter = new IpRateLimiter('demo:ip:', 3, 3_600_000);

    limiter.recordFailure('1.1.1.1');
    limiter.recordFailure('1.1.1.1');
    limiter.recordFailure('1.1.1.1');
    expect(limiter.isBlocked('1.1.1.1')).toBe(true);
    expect(limiter.isBlocked('2.2.2.2')).toBe(false);
  });

  it('reset limpia el contador de una IP', () => {
    const limiter = new IpRateLimiter('demo:ip:', 3, 3_600_000);
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
    const limiter = new IpRateLimiter(
      'demo:ip:',
      3,
      3_600_000,
      () => ahoraFake.valor,
    );
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
    const limiter = new IpRateLimiter('demo:ip:', 1, 3_600_000, Date.now, 2);

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

  it('keyPrefix da presupuestos independientes a dos instancias sobre la MISMA IP (C1.1 — design §6.4)', () => {
    const demoLimiter = new IpRateLimiter('demo:ip:', 1, 3_600_000);
    const googleLimiter = new IpRateLimiter('google:ip:', 1, 3_600_000);
    const ip = '9.9.9.9';

    demoLimiter.recordFailure(ip);
    expect(demoLimiter.isBlocked(ip)).toBe(true);

    // Mismo IP, prefijo distinto: el presupuesto de google NO se contagia
    // del de demo — son namespaces separados, no el mismo contador.
    expect(googleLimiter.isBlocked(ip)).toBe(false);

    googleLimiter.recordFailure(ip);
    expect(googleLimiter.isBlocked(ip)).toBe(true);

    // reset en una instancia no afecta a la otra.
    demoLimiter.reset(ip);
    expect(demoLimiter.isBlocked(ip)).toBe(false);
    expect(googleLimiter.isBlocked(ip)).toBe(true);
  });
});
