import { assertDestructiveDbAllowed } from './db-safety';

describe('assertDestructiveDbAllowed', () => {
  const original = process.env.ALLOW_DESTRUCTIVE_DB;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.ALLOW_DESTRUCTIVE_DB;
    } else {
      process.env.ALLOW_DESTRUCTIVE_DB = original;
    }
  });

  it('no lanza cuando el flag está en 1, la cadena no es producción, y se pasa un opt-in (ignorado, no aplica)', () => {
    process.env.ALLOW_DESTRUCTIVE_DB = '1';

    expect(() =>
      assertDestructiveDbAllowed({
        connectionString: 'postgres://x@localhost:5432/postgres',
        allowProductionAck: {
          envVar: 'TEST_CONFIRM_PROD_OP',
          expected: 'test-op',
          operation: 'test operation',
        },
      }),
    ).not.toThrow();
  });

  it('lanza un error claro cuando falta el opt-in ALLOW_DESTRUCTIVE_DB', () => {
    delete process.env.ALLOW_DESTRUCTIVE_DB;

    expect(() =>
      assertDestructiveDbAllowed({ connectionString: 'postgres://x@dev-host/db' }),
    ).toThrow(/ALLOW_DESTRUCTIVE_DB/);
  });

  it('no lanza cuando el flag está en 1 y la cadena no parece producción', () => {
    process.env.ALLOW_DESTRUCTIVE_DB = '1';

    expect(() =>
      assertDestructiveDbAllowed({ connectionString: 'postgres://x@localhost:5432/postgres' }),
    ).not.toThrow();
  });

  it('rechaza aunque el flag esté seteado si la cadena parece apuntar a producción', () => {
    process.env.ALLOW_DESTRUCTIVE_DB = '1';

    expect(() =>
      assertDestructiveDbAllowed({ connectionString: 'postgres://x@prod-db.example.com/production' }),
    ).toThrow(/producción/);
  });

  it('trata cualquier valor distinto de "1" como no habilitado', () => {
    process.env.ALLOW_DESTRUCTIVE_DB = 'true';

    expect(() =>
      assertDestructiveDbAllowed({ connectionString: 'postgres://x@dev/db' }),
    ).toThrow(/ALLOW_DESTRUCTIVE_DB/);
  });

  it('rechaza el pooler real de Supabase (host contiene supabase.com) aunque no diga "prod"', () => {
    process.env.ALLOW_DESTRUCTIVE_DB = '1';

    expect(() =>
      assertDestructiveDbAllowed({
        connectionString:
          'postgresql://postgres.cpudmeahqjiuvpqvvizg:PW@aws-1-us-west-2.pooler.supabase.com:6543/postgres',
      }),
    ).toThrow(/producción/);
  });

  it('rechaza la conexión directa de Supabase (host contiene supabase.co) aunque no diga "prod"', () => {
    process.env.ALLOW_DESTRUCTIVE_DB = '1';

    expect(() =>
      assertDestructiveDbAllowed({
        connectionString: 'postgresql://postgres:PW@db.cpudmeahqjiuvpqvvizg.supabase.co:5432/postgres',
      }),
    ).toThrow(/producción/);
  });
});

describe('assertDestructiveDbAllowed — allowProductionAck (opt-in explícito para prod supervisada)', () => {
  const PROD_CONNECTION_STRING = 'postgres://x@prod-db.example.com/production';
  const ACK = {
    envVar: 'TEST_CONFIRM_PROD_OP',
    expected: 'us-013-transaccion-categorias',
    operation: 'US-013 transaccion categoria backfill',
  };

  const originalAllow = process.env.ALLOW_DESTRUCTIVE_DB;
  const originalAck = process.env[ACK.envVar];

  afterEach(() => {
    if (originalAllow === undefined) {
      delete process.env.ALLOW_DESTRUCTIVE_DB;
    } else {
      process.env.ALLOW_DESTRUCTIVE_DB = originalAllow;
    }
    if (originalAck === undefined) {
      delete process.env[ACK.envVar];
    } else {
      process.env[ACK.envVar] = originalAck;
    }
    vi.restoreAllMocks();
  });

  it('rechaza sin ALLOW_DESTRUCTIVE_DB=1 aunque el ack de producción esté correctamente seteado', () => {
    delete process.env.ALLOW_DESTRUCTIVE_DB;
    process.env[ACK.envVar] = ACK.expected;

    expect(() =>
      assertDestructiveDbAllowed({
        connectionString: PROD_CONNECTION_STRING,
        allowProductionAck: ACK,
      }),
    ).toThrow(/ALLOW_DESTRUCTIVE_DB/);
  });

  it('rechaza cadena de producción cuando no se pasa allowProductionAck (comportamiento default, ej. seed/int-specs)', () => {
    process.env.ALLOW_DESTRUCTIVE_DB = '1';
    delete process.env[ACK.envVar];

    expect(() =>
      assertDestructiveDbAllowed({ connectionString: PROD_CONNECTION_STRING }),
    ).toThrow(/producción/);
  });

  it('rechaza cadena de producción cuando el env var de confirmación no está seteado', () => {
    process.env.ALLOW_DESTRUCTIVE_DB = '1';
    delete process.env[ACK.envVar];

    expect(() =>
      assertDestructiveDbAllowed({
        connectionString: PROD_CONNECTION_STRING,
        allowProductionAck: ACK,
      }),
    ).toThrow(/producción/);
  });

  it('rechaza cadena de producción cuando el env var de confirmación tiene un valor incorrecto', () => {
    process.env.ALLOW_DESTRUCTIVE_DB = '1';
    process.env[ACK.envVar] = 'algo-distinto';

    expect(() =>
      assertDestructiveDbAllowed({
        connectionString: PROD_CONNECTION_STRING,
        allowProductionAck: ACK,
      }),
    ).toThrow(/producción/);
  });

  it('permite la operación contra producción cuando el ack coincide exactamente y ALLOW_DESTRUCTIVE_DB=1, y emite un warning fuerte', () => {
    process.env.ALLOW_DESTRUCTIVE_DB = '1';
    process.env[ACK.envVar] = ACK.expected;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(() =>
      assertDestructiveDbAllowed({
        connectionString: PROD_CONNECTION_STRING,
        allowProductionAck: ACK,
      }),
    ).not.toThrow();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [message] = warnSpy.mock.calls[0] as [string];
    expect(message).toMatch(ACK.operation);
    expect(message).toMatch(/producci[oó]n|production/i);
  });
});

describe('assertDestructiveDbAllowed — Supabase real (única BD del proyecto = producción)', () => {
  const REAL_PROD_CONNECTION_STRING =
    'postgresql://postgres.cpudmeahqjiuvpqvvizg:PW@aws-1-us-west-2.pooler.supabase.com:6543/postgres';
  const ACK = {
    envVar: 'TEST_CONFIRM_PROD_OP',
    expected: 'us-013-transaccion-categorias',
    operation: 'US-013 transaccion categoria backfill',
  };

  const originalAllow = process.env.ALLOW_DESTRUCTIVE_DB;
  const originalAck = process.env[ACK.envVar];

  afterEach(() => {
    if (originalAllow === undefined) {
      delete process.env.ALLOW_DESTRUCTIVE_DB;
    } else {
      process.env.ALLOW_DESTRUCTIVE_DB = originalAllow;
    }
    if (originalAck === undefined) {
      delete process.env[ACK.envVar];
    } else {
      process.env[ACK.envVar] = originalAck;
    }
    vi.restoreAllMocks();
  });

  it('rechaza el pooler real de Supabase para llamadores default (seed/int-specs) aunque ALLOW_DESTRUCTIVE_DB=1', () => {
    process.env.ALLOW_DESTRUCTIVE_DB = '1';

    expect(() =>
      assertDestructiveDbAllowed({ connectionString: REAL_PROD_CONNECTION_STRING }),
    ).toThrow(/producción/);
  });

  it('el opt-in allowProductionAck ahora SÍ se alcanza contra el pooler real y permite la operación con warning', () => {
    process.env.ALLOW_DESTRUCTIVE_DB = '1';
    process.env[ACK.envVar] = ACK.expected;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(() =>
      assertDestructiveDbAllowed({
        connectionString: REAL_PROD_CONNECTION_STRING,
        allowProductionAck: ACK,
      }),
    ).not.toThrow();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [message] = warnSpy.mock.calls[0] as [string];
    expect(message).toMatch(ACK.operation);
  });
});
