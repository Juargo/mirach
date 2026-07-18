import { LoginRateLimiter } from './login-rate-limiter';

const CONFIG = { maxPorEmail: 3, maxPorIp: 5, ventanaMs: 900_000 };

describe('LoginRateLimiter', () => {
  it('no bloquea antes de alcanzar ningún umbral', () => {
    const limiter = new LoginRateLimiter(CONFIG);

    expect(limiter.estaBloqueado('1.2.3.4', 'user@example.com')).toBe(false);
  });

  it('bloquea tras alcanzar maxPorEmail fallos para ese email', () => {
    const limiter = new LoginRateLimiter(CONFIG);
    const ip = '1.2.3.4';
    const email = 'user@example.com';

    limiter.registrarFallo(ip, email);
    limiter.registrarFallo(ip, email);
    expect(limiter.estaBloqueado(ip, email)).toBe(false);

    limiter.registrarFallo(ip, email);
    expect(limiter.estaBloqueado(ip, email)).toBe(true);
  });

  it('bloquea tras alcanzar maxPorIp fallos para esa IP, con emails distintos', () => {
    const limiter = new LoginRateLimiter(CONFIG);
    const ip = '9.9.9.9';

    limiter.registrarFallo(ip, 'a@example.com');
    limiter.registrarFallo(ip, 'b@example.com');
    limiter.registrarFallo(ip, 'c@example.com');
    limiter.registrarFallo(ip, 'd@example.com');
    expect(limiter.estaBloqueado(ip, 'e@example.com')).toBe(false);

    limiter.registrarFallo(ip, 'e@example.com');
    expect(limiter.estaBloqueado(ip, 'e@example.com')).toBe(true);
  });

  it('resetear limpia ambos contadores tras un login exitoso', () => {
    const limiter = new LoginRateLimiter(CONFIG);
    const ip = '1.2.3.4';
    const email = 'user@example.com';

    limiter.registrarFallo(ip, email);
    limiter.registrarFallo(ip, email);
    limiter.registrarFallo(ip, email);
    expect(limiter.estaBloqueado(ip, email)).toBe(true);

    limiter.resetear(ip, email);
    expect(limiter.estaBloqueado(ip, email)).toBe(false);
  });

  it('la ventana expirada vuelve a permitir intentos', () => {
    const ahoraFake = { valor: 0 };
    const limiter = new LoginRateLimiter(CONFIG, () => ahoraFake.valor);
    const ip = '1.2.3.4';
    const email = 'user@example.com';

    limiter.registrarFallo(ip, email);
    limiter.registrarFallo(ip, email);
    limiter.registrarFallo(ip, email);
    expect(limiter.estaBloqueado(ip, email)).toBe(true);

    ahoraFake.valor += CONFIG.ventanaMs + 1;

    expect(limiter.estaBloqueado(ip, email)).toBe(false);
  });

  it('normaliza el email (trim + lowercase) para la clave de conteo', () => {
    const limiter = new LoginRateLimiter(CONFIG);
    const ip = '1.2.3.4';

    limiter.registrarFallo(ip, '  User@Example.com  ');
    limiter.registrarFallo(ip, 'user@example.com');
    limiter.registrarFallo(ip, 'USER@EXAMPLE.COM');

    expect(limiter.estaBloqueado(ip, 'user@example.com')).toBe(true);
  });
});
