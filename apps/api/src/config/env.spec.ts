import { loadEnv } from './env';

function omit<T extends object, K extends keyof T>(
  source: T,
  key: K,
): Omit<T, K> {
  const clone = { ...source };
  delete clone[key];
  return clone;
}

const baseDevSource = {
  NODE_ENV: 'development',
  PORT: '3000',
  DATABASE_URL: 'postgres://user:pass@localhost:5432/moneydiary',
  API_KEY: 'a'.repeat(16),
  COOKIE_SECURE: 'false',
};

const baseTestSource = {
  ...baseDevSource,
  NODE_ENV: 'test',
};

const baseProdSource = {
  NODE_ENV: 'production',
  PORT: '3000',
  DATABASE_URL:
    'postgresql://postgres.cpudmeahqjiuvpqvvizg:pw@aws-1-us-west-2.pooler.supabase.com:6543/postgres',
  API_KEY: 'a'.repeat(16),
  COOKIE_SECURE: 'true',
};

describe('loadEnv — happy path per NODE_ENV', () => {
  it('development: acepta DB localhost y devuelve un Env tipado e inmutable', () => {
    const env = loadEnv(baseDevSource);

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.DATABASE_URL).toBe(baseDevSource.DATABASE_URL);
    expect(env.COOKIE_SECURE).toBe(false);
    expect(Object.isFrozen(env)).toBe(true);
  });

  it('test: acepta DB localhost', () => {
    const env = loadEnv(baseTestSource);

    expect(env.NODE_ENV).toBe('test');
    expect(env.DATABASE_URL).toBe(baseTestSource.DATABASE_URL);
  });

  it('production: acepta host Supabase y COOKIE_SECURE=true', () => {
    const env = loadEnv(baseProdSource);

    expect(env.NODE_ENV).toBe('production');
    expect(env.COOKIE_SECURE).toBe(true);
    expect(env.DATABASE_URL).toBe(baseProdSource.DATABASE_URL);
  });

  it('NODE_ENV ausente cae a development por default (default seguro)', () => {
    const env = loadEnv(omit(baseDevSource, 'NODE_ENV'));

    expect(env.NODE_ENV).toBe('development');
  });

  it('rate-limit vars aplican los defaults documentados cuando están ausentes', () => {
    const env = loadEnv(baseDevSource);

    expect(env.LOGIN_RATELIMIT_MAX_EMAIL).toBe(5);
    expect(env.LOGIN_RATELIMIT_MAX_IP).toBe(20);
    expect(env.LOGIN_RATELIMIT_WINDOW_MS).toBe(900000);
  });

  it('DIRECT_URL tiene precedencia sobre DATABASE_URL para la validación de host', () => {
    const env = loadEnv({
      ...baseDevSource,
      DATABASE_URL:
        'postgresql://postgres:pw@db.cpudmeahqjiuvpqvvizg.supabase.co:5432/postgres',
      DIRECT_URL: 'postgres://user:pass@localhost:5432/moneydiary-direct',
    });

    expect(env.DIRECT_URL).toBe(
      'postgres://user:pass@localhost:5432/moneydiary-direct',
    );
  });
});

describe('loadEnv — reglas superRefine por entorno (ENV-02/03/04)', () => {
  it('production rechaza COOKIE_SECURE=false', () => {
    expect(() =>
      loadEnv({ ...baseProdSource, COOKIE_SECURE: 'false' }),
    ).toThrow(/COOKIE_SECURE/);
  });

  it('production rechaza un host de BD que no es Supabase', () => {
    expect(() =>
      loadEnv({
        ...baseProdSource,
        DATABASE_URL: 'postgres://user:pass@localhost:5432/moneydiary',
      }),
    ).toThrow(/Supabase/);
  });

  it('production rechaza ALLOW_DESTRUCTIVE_DB definido', () => {
    expect(() =>
      loadEnv({ ...baseProdSource, ALLOW_DESTRUCTIVE_DB: '1' }),
    ).toThrow(/ALLOW_DESTRUCTIVE_DB/);
  });

  it('development rechaza un host de BD que no es localhost', () => {
    expect(() =>
      loadEnv({
        ...baseDevSource,
        DATABASE_URL:
          'postgresql://postgres:pw@db.cpudmeahqjiuvpqvvizg.supabase.co:5432/postgres',
      }),
    ).toThrow(/localhost/);
  });

  it('test rechaza un host de BD que no es localhost', () => {
    expect(() =>
      loadEnv({
        ...baseTestSource,
        DATABASE_URL:
          'postgresql://postgres:pw@db.cpudmeahqjiuvpqvvizg.supabase.co:5432/postgres',
      }),
    ).toThrow(/localhost/);
  });
});

describe('loadEnv — COOKIE_SECURE vía enum, no coerción (ENV-05)', () => {
  it('"false" parsea a boolean false', () => {
    const env = loadEnv({ ...baseDevSource, COOKIE_SECURE: 'false' });

    expect(env.COOKIE_SECURE).toBe(false);
  });

  it('"true" parsea a boolean true', () => {
    const env = loadEnv({ ...baseDevSource, COOKIE_SECURE: 'true' });

    expect(env.COOKIE_SECURE).toBe(true);
  });

  it('un valor fuera del enum (ej. "yes") lanza en vez de coercionar a truthy', () => {
    expect(() => loadEnv({ ...baseDevSource, COOKIE_SECURE: 'yes' })).toThrow(
      /COOKIE_SECURE/,
    );
  });
});

describe('loadEnv — fail-fast, nunca un Env parcial (ENV-01)', () => {
  it('API_KEY ausente lanza antes de boot', () => {
    expect(() => loadEnv(omit(baseDevSource, 'API_KEY'))).toThrow();
  });

  it('DATABASE_URL ausente lanza antes de boot', () => {
    expect(() => loadEnv(omit(baseDevSource, 'DATABASE_URL'))).toThrow();
  });

  it('PORT malformado (no numérico) lanza', () => {
    expect(() => loadEnv({ ...baseDevSource, PORT: 'not-a-port' })).toThrow();
  });
});

describe('loadEnv — coerción de rate-limit falla cerrado (ENV-01)', () => {
  it('un valor no numérico rechaza', () => {
    expect(() =>
      loadEnv({ ...baseDevSource, LOGIN_RATELIMIT_MAX_EMAIL: 'abc' }),
    ).toThrow();
  });

  it('un string vacío coerciona a 0 y rechaza por no-positivo', () => {
    expect(() =>
      loadEnv({ ...baseDevSource, LOGIN_RATELIMIT_MAX_IP: '' }),
    ).toThrow();
  });
});
