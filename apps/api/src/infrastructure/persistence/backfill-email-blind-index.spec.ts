import {
  runBackfillEmailBlindIndex,
  partitionBatch,
  parseBatchSizeArg,
  main,
  scrubCredenciales,
  logBackfillFailure,
  type EmailBackfillClient,
} from '../../../prisma/backfill-email-blind-index';
import { AesGcmCryptoService } from './aes-gcm-crypto.service';
import { HmacBlindIndexService } from './hmac-blind-index.service';
import { deriveBlindIndexKey } from '../../composition/derive-blind-index-key';
import { buildTestEnv } from '../../../test/support/env.fixture';

/**
 * backfill-email-blind-index — unit tests (US-035, sin BD). Mirrors
 * backfill-descripcion-encryption.spec.ts's structure/fake-client pattern.
 *
 * Usa las implementaciones REALES de AesGcmCryptoService/HmacBlindIndexService
 * (no fakes) con la clave fija de 32 bytes de test/support/env.fixture.ts,
 * derivando el blind index con el MISMO helper que container.ts/seed.ts —
 * así el roundtrip encrypt/decrypt y el cómputo del índice se ejercitan de
 * verdad.
 */

function makeCryptoAndBlindIndex() {
  const env = buildTestEnv();
  const key = Buffer.from(env.ENCRYPTION_KEY, 'base64');
  return {
    crypto: new AesGcmCryptoService(key),
    blindIndex: new HmacBlindIndexService(deriveBlindIndexKey(key)),
  };
}

interface FakeUser {
  id: string;
  email: string;
}

function makeFakeClient(
  users: FakeUser[],
  options: { failUpdateAtCallIndex?: number } = {},
) {
  const updateCalls: Array<{
    id: string;
    email: string;
    emailBlindIndex: string;
  }> = [];
  const transactionCalls: Array<{
    opsCount: number;
    options: { timeout?: number; maxWait?: number } | undefined;
  }> = [];
  let updateCallCount = 0;

  const client: EmailBackfillClient = {
    user: {
      findMany: async ({ where, take }) => {
        const startIndex = where.id
          ? users.findIndex((u) => u.id === where.id!.gt) + 1
          : 0;
        return users
          .slice(startIndex, startIndex + take)
          .map((u) => ({ ...u }));
      },
      update: async ({ where, data }) => {
        updateCallCount++;
        if (options.failUpdateAtCallIndex === updateCallCount) {
          throw new Error('fake update failure (simulated crash)');
        }
        updateCalls.push({
          id: where.id,
          email: data.email,
          emailBlindIndex: data.emailBlindIndex,
        });
        const row = users.find((u) => u.id === where.id);
        if (row) {
          row.email = data.email;
        }
        return { id: where.id };
      },
    },
    $transaction: async <T>(
      ops: Promise<T>[],
      txOptions?: { timeout?: number; maxWait?: number },
    ) => {
      transactionCalls.push({ opsCount: ops.length, options: txOptions });
      return Promise.all(ops);
    },
  };

  return { client, updateCalls, users, transactionCalls };
}

describe('partitionBatch — lógica pura (sin I/O)', () => {
  it('cifra + indexa las filas en texto plano y salta las que ya son un ciphertext v1 válido', () => {
    const { crypto, blindIndex } = makeCryptoAndBlindIndex();
    const rows = [
      { id: 'user-1', email: 'Persona@Example.com' },
      { id: 'user-2', email: 'v1:iv:tag:ciphertext' },
    ];

    const { toUpdate, skipped, sospechosas } = partitionBatch(
      rows,
      crypto,
      blindIndex,
    );

    expect(skipped).toBe(1);
    expect(sospechosas).toHaveLength(0);
    expect(toUpdate).toHaveLength(1);
    expect(toUpdate[0].id).toBe('user-1');
    expect(toUpdate[0].emailCifrado.startsWith('v1:')).toBe(true);
    expect(toUpdate[0].emailBlindIndex).toBe(
      blindIndex.compute('persona@example.com'),
    );
  });

  it('normaliza (trim + lowercase) ANTES de cifrar/indexar — mismo comportamiento que Email VO', () => {
    const { crypto, blindIndex } = makeCryptoAndBlindIndex();
    const rows = [{ id: 'user-1', email: '  Foo@Bar.com  ' }];

    const { toUpdate } = partitionBatch(rows, crypto, blindIndex);

    expect(crypto.decrypt(toUpdate[0].emailCifrado)).toBe('foo@bar.com');
    expect(toUpdate[0].emailBlindIndex).toBe(blindIndex.compute('foo@bar.com'));
  });

  it('clasifica como sospechosa (ni cifra ni salta) una fila con prefijo v1: que NO parsea como ciphertext', () => {
    const { crypto, blindIndex } = makeCryptoAndBlindIndex();
    const rows = [{ id: 'user-sospechoso', email: 'v1: no-es-un-email-real' }];

    const { toUpdate, skipped, sospechosas } = partitionBatch(
      rows,
      crypto,
      blindIndex,
    );

    expect(toUpdate).toHaveLength(0);
    expect(skipped).toBe(0);
    expect(sospechosas).toEqual(['user-sospechoso']);
  });
});

describe('runBackfillEmailBlindIndex — cifrado + índice (unit, sin BD)', () => {
  it('un email en texto plano se cifra y se indexa: decrypt() recupera el original y buscar por blind index matchea', async () => {
    const { crypto, blindIndex } = makeCryptoAndBlindIndex();
    const { client, updateCalls, users } = makeFakeClient([
      { id: 'user-1', email: 'seed@moneydiary.local' },
    ]);

    const summary = await runBackfillEmailBlindIndex(
      client,
      crypto,
      blindIndex,
      {
        dryRun: false,
      },
    );

    expect(summary).toEqual({
      totalScanned: 1,
      totalEncrypted: 1,
      totalSkippedYaCifradas: 0,
      totalSospechosas: 0,
    });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].email.startsWith('v1:')).toBe(true);
    expect(crypto.decrypt(users[0].email)).toBe('seed@moneydiary.local');
    expect(updateCalls[0].emailBlindIndex).toBe(
      blindIndex.compute('seed@moneydiary.local'),
    );
  });

  it('una fila que ya empieza con v1: se SALTA — no se emite ningún update para ella', async () => {
    const { crypto, blindIndex } = makeCryptoAndBlindIndex();
    const yaCifrado = crypto.encrypt('sueldo@empresa.cl');
    const { client, updateCalls } = makeFakeClient([
      { id: 'user-1', email: yaCifrado },
    ]);

    const summary = await runBackfillEmailBlindIndex(
      client,
      crypto,
      blindIndex,
      {
        dryRun: false,
      },
    );

    expect(summary).toEqual({
      totalScanned: 1,
      totalEncrypted: 0,
      totalSkippedYaCifradas: 1,
      totalSospechosas: 0,
    });
    expect(updateCalls).toHaveLength(0);
  });

  it('idempotencia: correr dos veces sobre el mismo dataset cifra cada fila UNA sola vez', async () => {
    const { crypto, blindIndex } = makeCryptoAndBlindIndex();
    const { client, updateCalls, users } = makeFakeClient([
      { id: 'user-1', email: 'a@example.com' },
      { id: 'user-2', email: 'b@example.com' },
    ]);

    const firstRun = await runBackfillEmailBlindIndex(
      client,
      crypto,
      blindIndex,
      {
        dryRun: false,
      },
    );
    expect(firstRun.totalEncrypted).toBe(2);
    expect(updateCalls).toHaveLength(2);

    const stateAfterFirstRun = users.map((u) => u.email);

    const secondRun = await runBackfillEmailBlindIndex(
      client,
      crypto,
      blindIndex,
      {
        dryRun: false,
      },
    );

    expect(secondRun).toEqual({
      totalScanned: 2,
      totalEncrypted: 0,
      totalSkippedYaCifradas: 2,
      totalSospechosas: 0,
    });
    expect(updateCalls).toHaveLength(2);
    expect(users.map((u) => u.email)).toEqual(stateAfterFirstRun);
  });

  it('resumen correcto en un batch mixto (texto plano + ya cifradas)', async () => {
    const { crypto, blindIndex } = makeCryptoAndBlindIndex();
    const { client } = makeFakeClient([
      { id: 'user-1', email: 'a@example.com' },
      { id: 'user-2', email: crypto.encrypt('b@example.com') },
      { id: 'user-3', email: 'c@example.com' },
    ]);

    const summary = await runBackfillEmailBlindIndex(
      client,
      crypto,
      blindIndex,
      {
        dryRun: false,
      },
    );

    expect(summary).toEqual({
      totalScanned: 3,
      totalEncrypted: 2,
      totalSkippedYaCifradas: 1,
      totalSospechosas: 0,
    });
  });

  it('--dry-run calcula el resumen pero no escribe nada', async () => {
    const { crypto, blindIndex } = makeCryptoAndBlindIndex();
    const { client, updateCalls, users } = makeFakeClient([
      { id: 'user-1', email: 'a@example.com' },
    ]);

    const summary = await runBackfillEmailBlindIndex(
      client,
      crypto,
      blindIndex,
      {
        dryRun: true,
      },
    );

    expect(summary).toEqual({
      totalScanned: 1,
      totalEncrypted: 1,
      totalSkippedYaCifradas: 0,
      totalSospechosas: 0,
    });
    expect(updateCalls).toHaveLength(0);
    expect(users[0].email).toBe('a@example.com');
  });

  it('pagina correctamente por batches (batchSize menor al total de filas) y cifra TODAS', async () => {
    const { crypto, blindIndex } = makeCryptoAndBlindIndex();
    const { client, updateCalls } = makeFakeClient([
      { id: 'user-1', email: 'a@example.com' },
      { id: 'user-2', email: 'b@example.com' },
      { id: 'user-3', email: 'c@example.com' },
      { id: 'user-4', email: 'd@example.com' },
      { id: 'user-5', email: 'e@example.com' },
    ]);

    const summary = await runBackfillEmailBlindIndex(
      client,
      crypto,
      blindIndex,
      {
        dryRun: false,
        batchSize: 2,
      },
    );

    expect(summary).toEqual({
      totalScanned: 5,
      totalEncrypted: 5,
      totalSkippedYaCifradas: 0,
      totalSospechosas: 0,
    });
    expect(updateCalls).toHaveLength(5);
  });

  it('tabla vacía: no escanea nada y no emite updates', async () => {
    const { crypto, blindIndex } = makeCryptoAndBlindIndex();
    const { client, updateCalls } = makeFakeClient([]);

    const summary = await runBackfillEmailBlindIndex(
      client,
      crypto,
      blindIndex,
      {
        dryRun: false,
      },
    );

    expect(summary).toEqual({
      totalScanned: 0,
      totalEncrypted: 0,
      totalSkippedYaCifradas: 0,
      totalSospechosas: 0,
    });
    expect(updateCalls).toHaveLength(0);
  });

  it('fila sospechosa: no se cifra ni se cuenta como ya-cifrada — se reporta aparte y se loguea un WARNING con su id (nunca el email)', async () => {
    const { crypto, blindIndex } = makeCryptoAndBlindIndex();
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const { client, updateCalls, users } = makeFakeClient([
      { id: 'user-normal', email: 'normal@example.com' },
      { id: 'user-sospechoso', email: 'v1: no-es-ciphertext' },
      { id: 'user-cifrado', email: crypto.encrypt('cifrado@example.com') },
    ]);

    const summary = await runBackfillEmailBlindIndex(
      client,
      crypto,
      blindIndex,
      {
        dryRun: false,
      },
    );

    expect(summary).toEqual({
      totalScanned: 3,
      totalEncrypted: 1,
      totalSkippedYaCifradas: 1,
      totalSospechosas: 1,
    });
    expect(updateCalls.map((c) => c.id)).toEqual(['user-normal']);
    expect(users.find((u) => u.id === 'user-sospechoso')!.email).toBe(
      'v1: no-es-ciphertext',
    );
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const loggedArgs = warnSpy.mock.calls[0].join(' ');
    expect(loggedArgs).toContain('user-sospechoso');
    expect(loggedArgs).not.toContain('no-es-ciphertext');

    warnSpy.mockRestore();
  });

  it('resumability: si una corrida falla a mitad de camino, una segunda corrida completa solo las filas pendientes', async () => {
    const { crypto, blindIndex } = makeCryptoAndBlindIndex();
    const { client, users } = makeFakeClient(
      [
        { id: 'user-1', email: 'a@example.com' },
        { id: 'user-2', email: 'b@example.com' },
        { id: 'user-3', email: 'c@example.com' },
      ],
      { failUpdateAtCallIndex: 2 },
    );

    await expect(
      runBackfillEmailBlindIndex(client, crypto, blindIndex, { dryRun: false }),
    ).rejects.toThrow(/fake update failure/);

    expect(users.find((u) => u.id === 'user-2')!.email).toBe('b@example.com');

    const secondRun = await runBackfillEmailBlindIndex(
      client,
      crypto,
      blindIndex,
      {
        dryRun: false,
      },
    );

    expect(secondRun.totalScanned).toBe(3);
    expect(secondRun.totalEncrypted).toBeGreaterThanOrEqual(1);
    expect(secondRun.totalSospechosas).toBe(0);

    for (const u of users) {
      expect(u.email.startsWith('v1:')).toBe(true);
    }
    expect(crypto.decrypt(users.find((u) => u.id === 'user-1')!.email)).toBe(
      'a@example.com',
    );
    expect(crypto.decrypt(users.find((u) => u.id === 'user-2')!.email)).toBe(
      'b@example.com',
    );
    expect(crypto.decrypt(users.find((u) => u.id === 'user-3')!.email)).toBe(
      'c@example.com',
    );
  });

  it('pasa un timeout y maxWait explícitos a $transaction', async () => {
    const { crypto, blindIndex } = makeCryptoAndBlindIndex();
    const { client, transactionCalls } = makeFakeClient([
      { id: 'user-1', email: 'a@example.com' },
    ]);

    await runBackfillEmailBlindIndex(client, crypto, blindIndex, {
      dryRun: false,
    });

    expect(transactionCalls).toHaveLength(1);
    expect(transactionCalls[0].options?.timeout).toBeGreaterThan(5000);
    expect(transactionCalls[0].options?.maxWait).toBeGreaterThan(0);
  });
});

describe('parseBatchSizeArg — flag --batch-size=N', () => {
  it('devuelve undefined cuando el flag no está presente (se usa el default)', () => {
    expect(parseBatchSizeArg(['--dry-run'])).toBeUndefined();
    expect(parseBatchSizeArg([])).toBeUndefined();
  });

  it('parsea un entero positivo', () => {
    expect(parseBatchSizeArg(['--batch-size=50'])).toBe(50);
    expect(parseBatchSizeArg(['--dry-run', '--batch-size=100'])).toBe(100);
  });

  it('lanza si el valor no es un entero positivo (0, negativo, no numérico, decimal)', () => {
    expect(() => parseBatchSizeArg(['--batch-size=0'])).toThrow(/batch-size/);
    expect(() => parseBatchSizeArg(['--batch-size=-5'])).toThrow(/batch-size/);
    expect(() => parseBatchSizeArg(['--batch-size=abc'])).toThrow(/batch-size/);
    expect(() => parseBatchSizeArg(['--batch-size=1.5'])).toThrow(/batch-size/);
  });

  it('lanza si el flag viene sin valor', () => {
    expect(() => parseBatchSizeArg(['--batch-size='])).toThrow(/batch-size/);
  });
});

describe('scrubCredenciales — redacta credenciales de connection string embebidas en un mensaje', () => {
  it('reemplaza el user:pass de una URL de conexión por ***:***', () => {
    const mensaje =
      'connect ECONNREFUSED postgres://produser:s3cr3t@prod-db.example.com:5432/production';

    expect(scrubCredenciales(mensaje)).toBe(
      'connect ECONNREFUSED postgres://***:***@prod-db.example.com:5432/production',
    );
  });

  it('deja intacto un mensaje sin credenciales embebidas', () => {
    const mensaje = 'Timeout esperando respuesta del pool';

    expect(scrubCredenciales(mensaje)).toBe(mensaje);
  });
});

describe('logBackfillFailure — nunca loguea el DSN crudo de un error de conexión', () => {
  it('scrubbea la URL de conexión embebida en el mensaje/stack antes de loguear el fallo', () => {
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const error = new Error(
      'connect ECONNREFUSED postgres://produser:s3cr3t@prod-db.example.com:5432/production',
    );
    error.stack = error.message;

    logBackfillFailure(error);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const loggedArgs = errorSpy.mock.calls[0].join(' ');
    expect(loggedArgs).not.toContain('s3cr3t');
    expect(loggedArgs).toContain('***:***');

    errorSpy.mockRestore();
  });

  it('errores no-Error (string/objeto arbitrario) también se scrubbean sin lanzar', () => {
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    logBackfillFailure(
      'postgres://produser:s3cr3t@prod-db.example.com/production',
    );

    const loggedArgs = errorSpy.mock.calls[0].join(' ');
    expect(loggedArgs).not.toContain('s3cr3t');

    errorSpy.mockRestore();
  });
});

describe('backfill-email-blind-index — gate ALLOW_DESTRUCTIVE_DB / ENCRYPTION_KEY (unit, sin BD)', () => {
  const originalAllow = process.env.ALLOW_DESTRUCTIVE_DB;
  const originalDbUrl = process.env.DATABASE_URL;
  const originalDirectUrl = process.env.DIRECT_URL;
  const originalConfirmProdBackfill = process.env.CONFIRM_PROD_BACKFILL;
  const originalEncryptionKey = process.env.ENCRYPTION_KEY;

  afterEach(() => {
    process.env.ALLOW_DESTRUCTIVE_DB = originalAllow;
    process.env.DATABASE_URL = originalDbUrl;
    process.env.DIRECT_URL = originalDirectUrl;
    process.env.CONFIRM_PROD_BACKFILL = originalConfirmProdBackfill;
    process.env.ENCRYPTION_KEY = originalEncryptionKey;
  });

  it('se rehúsa a correr sin ALLOW_DESTRUCTIVE_DB=1 (no llega a conectar a Prisma)', async () => {
    delete process.env.ALLOW_DESTRUCTIVE_DB;
    process.env.DATABASE_URL = 'postgres://x@dev-host/db';
    delete process.env.DIRECT_URL;

    await expect(main([])).rejects.toThrow(/ALLOW_DESTRUCTIVE_DB/);
  });

  it('rechaza cadenas de conexión de producción incluso con el flag activo', async () => {
    process.env.ALLOW_DESTRUCTIVE_DB = '1';
    process.env.DATABASE_URL = 'postgres://x@prod-db.example.com/production';
    delete process.env.DIRECT_URL;
    delete process.env.CONFIRM_PROD_BACKFILL;

    await expect(main([])).rejects.toThrow(/producción/);
  });

  it('rechaza producción si CONFIRM_PROD_BACKFILL tiene el valor esperado por OTRO backfill (namespacing por operación)', async () => {
    process.env.ALLOW_DESTRUCTIVE_DB = '1';
    process.env.DATABASE_URL = 'postgres://x@prod-db.example.com/production';
    delete process.env.DIRECT_URL;
    process.env.CONFIRM_PROD_BACKFILL = 'adr-013-descripcion-encryption';

    await expect(main([])).rejects.toThrow(/producción/);
  });

  it('sin DATABASE_URL/DIRECT_URL definidos, falla antes de intentar conectar', async () => {
    process.env.ALLOW_DESTRUCTIVE_DB = '1';
    delete process.env.DATABASE_URL;
    delete process.env.DIRECT_URL;

    await expect(main([])).rejects.toThrow(/DATABASE_URL|DIRECT_URL/);
  });

  it('con el gate de BD superado pero sin ENCRYPTION_KEY, falla antes de construir el crypto/blindIndex', async () => {
    process.env.ALLOW_DESTRUCTIVE_DB = '1';
    process.env.DATABASE_URL = 'postgres://x@localhost:5432/dev';
    delete process.env.DIRECT_URL;
    delete process.env.ENCRYPTION_KEY;

    await expect(main([])).rejects.toThrow(/ENCRYPTION_KEY/);
  });

  it('con ENCRYPTION_KEY inválida (no decodifica a 32 bytes), falla con el mismo mensaje', async () => {
    process.env.ALLOW_DESTRUCTIVE_DB = '1';
    process.env.DATABASE_URL = 'postgres://x@localhost:5432/dev';
    delete process.env.DIRECT_URL;
    process.env.ENCRYPTION_KEY = Buffer.alloc(16, 1).toString('base64');

    await expect(main([])).rejects.toThrow(/ENCRYPTION_KEY/);
  });
});
