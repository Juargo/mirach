import { LoginRateLimiter, readRateLimitConfigFromEnv } from './login-rate-limiter';

const CONFIG = { maxAttemptsPerEmail: 3, maxAttemptsPerIp: 5, windowMs: 900_000 };

describe('readRateLimitConfigFromEnv (fail-closed, AUTH-08)', () => {
  const envOriginal = { ...process.env };

  afterEach(() => {
    process.env = { ...envOriginal };
  });

  it('usa los defaults cuando las 3 env vars están ausentes', () => {
    delete process.env.LOGIN_RATELIMIT_MAX_EMAIL;
    delete process.env.LOGIN_RATELIMIT_MAX_IP;
    delete process.env.LOGIN_RATELIMIT_WINDOW_MS;

    expect(readRateLimitConfigFromEnv()).toEqual({
      maxAttemptsPerEmail: 5,
      maxAttemptsPerIp: 20,
      windowMs: 900_000,
    });
  });

  it('lanza (fail-closed) si una env var es string vacío — Number("")=0 causaría auto-bloqueo', () => {
    process.env.LOGIN_RATELIMIT_MAX_EMAIL = '';

    expect(() => readRateLimitConfigFromEnv()).toThrow();
  });

  it('lanza (fail-closed) si una env var no es numérica — NaN desactivaría el limiter en silencio', () => {
    process.env.LOGIN_RATELIMIT_MAX_IP = 'abc';

    expect(() => readRateLimitConfigFromEnv()).toThrow();
  });

  it('lanza (fail-closed) si una env var es 0', () => {
    process.env.LOGIN_RATELIMIT_WINDOW_MS = '0';

    expect(() => readRateLimitConfigFromEnv()).toThrow();
  });

  it('lanza (fail-closed) si una env var es negativa', () => {
    process.env.LOGIN_RATELIMIT_MAX_EMAIL = '-5';

    expect(() => readRateLimitConfigFromEnv()).toThrow();
  });

  it('acepta una config válida provista por env', () => {
    process.env.LOGIN_RATELIMIT_MAX_EMAIL = '10';
    process.env.LOGIN_RATELIMIT_MAX_IP = '40';
    process.env.LOGIN_RATELIMIT_WINDOW_MS = '600000';

    expect(readRateLimitConfigFromEnv()).toEqual({
      maxAttemptsPerEmail: 10,
      maxAttemptsPerIp: 40,
      windowMs: 600_000,
    });
  });
});

describe('LoginRateLimiter', () => {
  it('no bloquea antes de alcanzar ningún umbral', () => {
    const limiter = new LoginRateLimiter(CONFIG);

    expect(limiter.isBlocked('1.2.3.4', 'user@example.com')).toBe(false);
  });

  it('bloquea tras alcanzar maxAttemptsPerEmail fallos para ese email', () => {
    const limiter = new LoginRateLimiter(CONFIG);
    const ip = '1.2.3.4';
    const email = 'user@example.com';

    limiter.recordFailure(ip, email);
    limiter.recordFailure(ip, email);
    expect(limiter.isBlocked(ip, email)).toBe(false);

    limiter.recordFailure(ip, email);
    expect(limiter.isBlocked(ip, email)).toBe(true);
  });

  it('bloquea tras alcanzar maxAttemptsPerIp fallos para esa IP, con emails distintos', () => {
    const limiter = new LoginRateLimiter(CONFIG);
    const ip = '9.9.9.9';

    limiter.recordFailure(ip, 'a@example.com');
    limiter.recordFailure(ip, 'b@example.com');
    limiter.recordFailure(ip, 'c@example.com');
    limiter.recordFailure(ip, 'd@example.com');
    expect(limiter.isBlocked(ip, 'e@example.com')).toBe(false);

    limiter.recordFailure(ip, 'e@example.com');
    expect(limiter.isBlocked(ip, 'e@example.com')).toBe(true);
  });

  it('reset limpia ambos contadores tras un login exitoso', () => {
    const limiter = new LoginRateLimiter(CONFIG);
    const ip = '1.2.3.4';
    const email = 'user@example.com';

    limiter.recordFailure(ip, email);
    limiter.recordFailure(ip, email);
    limiter.recordFailure(ip, email);
    expect(limiter.isBlocked(ip, email)).toBe(true);

    limiter.reset(ip, email);
    expect(limiter.isBlocked(ip, email)).toBe(false);
  });

  it('la ventana expirada vuelve a permitir intentos', () => {
    const ahoraFake = { valor: 0 };
    const limiter = new LoginRateLimiter(CONFIG, () => ahoraFake.valor);
    const ip = '1.2.3.4';
    const email = 'user@example.com';

    limiter.recordFailure(ip, email);
    limiter.recordFailure(ip, email);
    limiter.recordFailure(ip, email);
    expect(limiter.isBlocked(ip, email)).toBe(true);

    ahoraFake.valor += CONFIG.windowMs + 1;

    expect(limiter.isBlocked(ip, email)).toBe(false);
  });

  it('el mapa no crece sin límite: al superar maxEntries se evictan las entradas más antiguas', () => {
    const configSensible = { maxAttemptsPerEmail: 1, maxAttemptsPerIp: 1000, windowMs: 900_000 };
    // maxEntries=4 (constructor param) para un test rápido — cada recordFailure
    // agrega 2 claves (email + ip), así que 2 llamadas llenan la capacidad.
    const limiter = new LoginRateLimiter(configSensible, Date.now, 4);

    limiter.recordFailure('1.1.1.1', 'a@example.com');
    expect(limiter.isBlocked('1.1.1.1', 'a@example.com')).toBe(true);

    limiter.recordFailure('2.2.2.2', 'b@example.com');
    expect(limiter.isBlocked('2.2.2.2', 'b@example.com')).toBe(true);

    // Un tercer fallo agrega 2 claves nuevas y supera maxEntries=4 — debe
    // evictar las entradas MÁS ANTIGUAS (las de 'a@example.com'/'1.1.1.1'),
    // no las recién insertadas.
    limiter.recordFailure('3.3.3.3', 'c@example.com');

    expect(limiter.isBlocked('1.1.1.1', 'a@example.com')).toBe(false);
    expect(limiter.isBlocked('2.2.2.2', 'b@example.com')).toBe(true);
    expect(limiter.isBlocked('3.3.3.3', 'c@example.com')).toBe(true);
  });

  it('normaliza el email (trim + lowercase) para la clave de conteo', () => {
    const limiter = new LoginRateLimiter(CONFIG);
    const ip = '1.2.3.4';

    limiter.recordFailure(ip, '  User@Example.com  ');
    limiter.recordFailure(ip, 'user@example.com');
    limiter.recordFailure(ip, 'USER@EXAMPLE.COM');

    expect(limiter.isBlocked(ip, 'user@example.com')).toBe(true);
  });
});
