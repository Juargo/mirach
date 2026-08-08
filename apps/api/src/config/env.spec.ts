import { loadEnv } from './env';

function omit<T extends object, K extends keyof T>(
  source: T,
  key: K,
): Omit<T, K> {
  const clone = { ...source };
  delete clone[key];
  return clone;
}

/** 32 bytes de ceros en base64 — clave válida solo para fixtures de test. */
const VALID_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

const baseDevSource = {
  NODE_ENV: 'development',
  PORT: '3000',
  DATABASE_URL: 'postgres://user:pass@localhost:5432/moneydiary',
  API_KEY: 'a'.repeat(16),
  COOKIE_SECURE: 'false',
  ENCRYPTION_KEY: VALID_ENCRYPTION_KEY,
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
  ENCRYPTION_KEY: VALID_ENCRYPTION_KEY,
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

describe('loadEnv — LOCALHOST_PATTERN anclado, no substring (design.md §3)', () => {
  it('development rechaza un host remoto que contiene la substring "localhost"', () => {
    expect(() =>
      loadEnv({
        ...baseDevSource,
        DATABASE_URL:
          'postgres://user:pass@my-localhost-mirror.attacker.example.com:5432/db',
      }),
    ).toThrow(/localhost/);
  });

  it('test rechaza un host remoto que contiene la substring "localhost"', () => {
    expect(() =>
      loadEnv({
        ...baseTestSource,
        DATABASE_URL:
          'postgres://user:pass@my-localhost-mirror.attacker.example.com:5432/db',
      }),
    ).toThrow(/localhost/);
  });

  it('development acepta loopback IPv6 [::1]', () => {
    const env = loadEnv({
      ...baseDevSource,
      DATABASE_URL: 'postgres://user:pass@[::1]:5432/db',
    });

    expect(env.DATABASE_URL).toBe('postgres://user:pass@[::1]:5432/db');
  });
});

describe('loadEnv — COOKIE_SECURE vía enum, no coerción (ENV-05)', () => {
  it('COOKIE_SECURE ausente aplica el default "false" (boolean false)', () => {
    const env = loadEnv(omit(baseDevSource, 'COOKIE_SECURE'));

    expect(env.COOKIE_SECURE).toBe(false);
  });

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

  it('API_KEY demasiado corta (<16 chars) lanza antes de boot — el chequeo de longitud vive acá, no por request (ADR-029)', () => {
    expect(() => loadEnv({ ...baseDevSource, API_KEY: 'corta' })).toThrow();
  });

  it('DATABASE_URL ausente lanza antes de boot', () => {
    expect(() => loadEnv(omit(baseDevSource, 'DATABASE_URL'))).toThrow();
  });

  it('PORT malformado (no numérico) lanza', () => {
    expect(() => loadEnv({ ...baseDevSource, PORT: 'not-a-port' })).toThrow();
  });
});

describe('loadEnv — ENCRYPTION_KEY: base64 de 32 bytes exactos (ADR-013)', () => {
  it('acepta una clave base64 válida de 32 bytes y expone el string tal cual', () => {
    const env = loadEnv(baseDevSource);

    expect(env.ENCRYPTION_KEY).toBe(VALID_ENCRYPTION_KEY);
    expect(Buffer.from(env.ENCRYPTION_KEY, 'base64')).toHaveLength(32);
  });

  it('ENCRYPTION_KEY ausente lanza antes de boot (requerida, igual que API_KEY)', () => {
    expect(() => loadEnv(omit(baseDevSource, 'ENCRYPTION_KEY'))).toThrow(
      /ENCRYPTION_KEY/,
    );
  });

  it('rechaza una clave que decodifica a MENOS de 32 bytes', () => {
    const shortKey = Buffer.alloc(16, 1).toString('base64');

    expect(() =>
      loadEnv({ ...baseDevSource, ENCRYPTION_KEY: shortKey }),
    ).toThrow(/ENCRYPTION_KEY/);
  });

  it('rechaza una clave que decodifica a MÁS de 32 bytes', () => {
    const longKey = Buffer.alloc(64, 1).toString('base64');

    expect(() =>
      loadEnv({ ...baseDevSource, ENCRYPTION_KEY: longKey }),
    ).toThrow(/ENCRYPTION_KEY/);
  });

  it('rechaza un string que no es base64 válido', () => {
    expect(() =>
      loadEnv({ ...baseDevSource, ENCRYPTION_KEY: 'no-es-base64-válido!!' }),
    ).toThrow(/ENCRYPTION_KEY/);
  });

  it('producción también exige ENCRYPTION_KEY válida (32 bytes)', () => {
    const env = loadEnv({
      ...baseProdSource,
      ENCRYPTION_KEY: VALID_ENCRYPTION_KEY,
    });

    expect(env.ENCRYPTION_KEY).toBe(VALID_ENCRYPTION_KEY);
  });
});

describe('loadEnv — GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REDIRECT_URI (auth-google-login, ADR-029, design §8)', () => {
  const GOOGLE_CALLBACK_PATH = '/api/auth/google/callback';
  const DEFAULT_LOCAL_REDIRECT_URI = `http://localhost:5173${GOOGLE_CALLBACK_PATH}`;
  const PROD_REDIRECT_URI = `https://app.moneydiary.cl${GOOGLE_CALLBACK_PATH}`;

  it('ambas credenciales presentes → el schema acepta', () => {
    const env = loadEnv({
      ...baseDevSource,
      GOOGLE_CLIENT_ID: 'client-id-123',
      GOOGLE_CLIENT_SECRET: 'client-secret-abc',
    });

    expect(env.GOOGLE_CLIENT_ID).toBe('client-id-123');
    expect(env.GOOGLE_CLIENT_SECRET).toBe('client-secret-abc');
  });

  it('ninguna credencial presente → el schema acepta (feature apagada)', () => {
    const env = loadEnv(baseDevSource);

    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(env.GOOGLE_CLIENT_SECRET).toBeUndefined();
    expect(env.GOOGLE_REDIRECT_URI).toBeUndefined();
  });

  it('EXACTAMENTE una credencial presente (solo CLIENT_ID) → boot falla (regla all-or-nothing)', () => {
    expect(() =>
      loadEnv({ ...baseDevSource, GOOGLE_CLIENT_ID: 'client-id-123' }),
    ).toThrow(/GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET/);
  });

  it('EXACTAMENTE una credencial presente (solo CLIENT_SECRET) → boot falla (regla all-or-nothing)', () => {
    expect(() =>
      loadEnv({ ...baseDevSource, GOOGLE_CLIENT_SECRET: 'client-secret-abc' }),
    ).toThrow(/GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET/);
  });

  it('ambas presentes, GOOGLE_REDIRECT_URI ausente, NODE_ENV=production → boot falla', () => {
    expect(() =>
      loadEnv({
        ...baseProdSource,
        GOOGLE_CLIENT_ID: 'client-id-123',
        GOOGLE_CLIENT_SECRET: 'client-secret-abc',
      }),
    ).toThrow(/GOOGLE_REDIRECT_URI/);
  });

  it('ambas presentes, GOOGLE_REDIRECT_URI ausente, NODE_ENV=development → default a http://localhost:5173/api/auth/google/callback', () => {
    const env = loadEnv({
      ...baseDevSource,
      GOOGLE_CLIENT_ID: 'client-id-123',
      GOOGLE_CLIENT_SECRET: 'client-secret-abc',
    });

    expect(env.GOOGLE_REDIRECT_URI).toBe(DEFAULT_LOCAL_REDIRECT_URI);
  });

  it('ambas presentes, GOOGLE_REDIRECT_URI ausente, NODE_ENV=test → default a http://localhost:5173/api/auth/google/callback', () => {
    const env = loadEnv({
      ...baseTestSource,
      GOOGLE_CLIENT_ID: 'client-id-123',
      GOOGLE_CLIENT_SECRET: 'client-secret-abc',
    });

    expect(env.GOOGLE_REDIRECT_URI).toBe(DEFAULT_LOCAL_REDIRECT_URI);
  });

  it('GOOGLE_REDIRECT_URI presente pero con pathname distinto al esperado → boot falla nombrando el pathname configurado Y el esperado', () => {
    expect(() =>
      loadEnv({
        ...baseDevSource,
        GOOGLE_CLIENT_ID: 'client-id-123',
        GOOGLE_CLIENT_SECRET: 'client-secret-abc',
        GOOGLE_REDIRECT_URI: 'http://localhost:5173/auth/callback-incorrecto',
      }),
    ).toThrow(/\/auth\/callback-incorrecto.*\/api\/auth\/google\/callback/s);
  });

  it('GOOGLE_REDIRECT_URI no-https en producción → boot falla', () => {
    expect(() =>
      loadEnv({
        ...baseProdSource,
        GOOGLE_CLIENT_ID: 'client-id-123',
        GOOGLE_CLIENT_SECRET: 'client-secret-abc',
        GOOGLE_REDIRECT_URI: `http://app.moneydiary.cl${GOOGLE_CALLBACK_PATH}`,
      }),
    ).toThrow(/GOOGLE_REDIRECT_URI|https/);
  });

  it('GOOGLE_REDIRECT_URI https válido con el pathname correcto en producción → boot acepta', () => {
    const env = loadEnv({
      ...baseProdSource,
      GOOGLE_CLIENT_ID: 'client-id-123',
      GOOGLE_CLIENT_SECRET: 'client-secret-abc',
      GOOGLE_REDIRECT_URI: PROD_REDIRECT_URI,
    });

    expect(env.GOOGLE_REDIRECT_URI).toBe(PROD_REDIRECT_URI);
  });

  it('GOOGLE_REDIRECT_URI malformada (no es una URL absoluta válida) en development → boot falla con mensaje accionable, nunca un TypeError crudo (4R C1)', () => {
    let captured: unknown;
    try {
      loadEnv({
        ...baseDevSource,
        GOOGLE_CLIENT_ID: 'client-id-123',
        GOOGLE_CLIENT_SECRET: 'client-secret-abc',
        GOOGLE_REDIRECT_URI: 'not-a-url',
      });
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(Error);
    expect(captured).not.toBeInstanceOf(TypeError);
    expect((captured as Error).message).toMatch(
      /Configuración de entorno inválida/,
    );
    expect((captured as Error).message).toMatch(/GOOGLE_REDIRECT_URI/);
  });

  it('GOOGLE_REDIRECT_URI malformada en producción → boot falla con mensaje accionable, nunca un TypeError crudo (4R C1)', () => {
    let captured: unknown;
    try {
      loadEnv({
        ...baseProdSource,
        GOOGLE_CLIENT_ID: 'client-id-123',
        GOOGLE_CLIENT_SECRET: 'client-secret-abc',
        GOOGLE_REDIRECT_URI: 'not-a-url',
      });
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(Error);
    expect(captured).not.toBeInstanceOf(TypeError);
    expect((captured as Error).message).toMatch(
      /Configuración de entorno inválida/,
    );
    expect((captured as Error).message).toMatch(/GOOGLE_REDIRECT_URI/);
  });

  it('GOOGLE_REDIRECT_URI="" (presente pero vacía) con credenciales en development → boot falla, NO recibe el default local (solo aplica cuando la var está ausente) (4R C1)', () => {
    let captured: unknown;
    try {
      loadEnv({
        ...baseDevSource,
        GOOGLE_CLIENT_ID: 'client-id-123',
        GOOGLE_CLIENT_SECRET: 'client-secret-abc',
        GOOGLE_REDIRECT_URI: '',
      });
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(Error);
    expect(captured).not.toBeInstanceOf(TypeError);
    expect((captured as Error).message).toMatch(
      /Configuración de entorno inválida/,
    );
    expect((captured as Error).message).toMatch(/GOOGLE_REDIRECT_URI/);
  });

  it('GOOGLE_REDIRECT_URI="" (presente pero vacía) con credenciales en producción → boot falla con mensaje accionable, nunca un TypeError crudo (4R C1)', () => {
    let captured: unknown;
    try {
      loadEnv({
        ...baseProdSource,
        GOOGLE_CLIENT_ID: 'client-id-123',
        GOOGLE_CLIENT_SECRET: 'client-secret-abc',
        GOOGLE_REDIRECT_URI: '',
      });
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(Error);
    expect(captured).not.toBeInstanceOf(TypeError);
    expect((captured as Error).message).toMatch(
      /Configuración de entorno inválida/,
    );
    expect((captured as Error).message).toMatch(/GOOGLE_REDIRECT_URI/);
  });

  it('AUTH-16: el gate de activación sigue siendo SOLO las dos credenciales — GOOGLE_REDIRECT_URI nunca es un tercer switch', () => {
    const conCredenciales = loadEnv({
      ...baseDevSource,
      GOOGLE_CLIENT_ID: 'client-id-123',
      GOOGLE_CLIENT_SECRET: 'client-secret-abc',
    });
    const sinCredenciales = loadEnv(baseDevSource);

    expect(
      conCredenciales.GOOGLE_CLIENT_ID !== undefined &&
        conCredenciales.GOOGLE_CLIENT_SECRET !== undefined,
    ).toBe(true);
    expect(
      sinCredenciales.GOOGLE_CLIENT_ID !== undefined &&
        sinCredenciales.GOOGLE_CLIENT_SECRET !== undefined,
    ).toBe(false);
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

  it('un número negativo rechaza (.positive())', () => {
    expect(() =>
      loadEnv({ ...baseDevSource, LOGIN_RATELIMIT_MAX_EMAIL: '-5' }),
    ).toThrow();
  });

  it('un override válido no-default parsea a los 3 valores exactos (round-trip)', () => {
    const env = loadEnv({
      ...baseDevSource,
      LOGIN_RATELIMIT_MAX_EMAIL: '10',
      LOGIN_RATELIMIT_MAX_IP: '40',
      LOGIN_RATELIMIT_WINDOW_MS: '600000',
    });

    expect(env.LOGIN_RATELIMIT_MAX_EMAIL).toBe(10);
    expect(env.LOGIN_RATELIMIT_MAX_IP).toBe(40);
    expect(env.LOGIN_RATELIMIT_WINDOW_MS).toBe(600000);
  });
});
