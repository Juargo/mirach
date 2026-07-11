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

  it('lanza un error claro cuando falta el opt-in ALLOW_DESTRUCTIVE_DB', () => {
    delete process.env.ALLOW_DESTRUCTIVE_DB;

    expect(() =>
      assertDestructiveDbAllowed({ connectionString: 'postgres://x@dev-host/db' }),
    ).toThrow(/ALLOW_DESTRUCTIVE_DB/);
  });

  it('no lanza cuando el flag está en 1 y la cadena no parece producción', () => {
    process.env.ALLOW_DESTRUCTIVE_DB = '1';

    expect(() =>
      assertDestructiveDbAllowed({ connectionString: 'postgres://x@dev-pooler.supabase.com/postgres' }),
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
});
