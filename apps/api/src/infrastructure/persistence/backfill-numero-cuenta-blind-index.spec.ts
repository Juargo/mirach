import {
  runBackfillNumeroCuentaBlindIndex,
  partitionBatch,
  parseBatchSizeArg,
  main,
  scrubCredenciales,
  logBackfillFailure,
  type NumeroCuentaBackfillClient,
} from '../../../prisma/backfill-numero-cuenta-blind-index';
import { AesGcmCryptoService } from './aes-gcm-crypto.service';
import { HmacBlindIndexService } from './hmac-blind-index.service';
import { deriveBlindIndexKey } from '../../composition/derive-blind-index-key';
import { buildTestEnv } from '../../../test/support/env.fixture';

/**
 * backfill-numero-cuenta-blind-index — unit tests (US-035 Slice 2, sin BD).
 * Mirrors backfill-email-blind-index.spec.ts's structure/fake-client
 * pattern.
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

interface FakeAccount {
  id: string;
  numeroCuenta: string;
}

function makeFakeClient(
  accounts: FakeAccount[],
  options: { failUpdateAtCallIndex?: number } = {},
) {
  const updateCalls: Array<{
    id: string;
    numeroCuenta: string;
    numeroCuentaBlindIndex: string;
  }> = [];
  const transactionCalls: Array<{
    opsCount: number;
    options: { timeout?: number; maxWait?: number } | undefined;
  }> = [];
  let updateCallCount = 0;

  const client: NumeroCuentaBackfillClient = {
    account: {
      findMany: async ({ where, take }) => {
        const startIndex = where.id
          ? accounts.findIndex((a) => a.id === where.id!.gt) + 1
          : 0;
        return accounts
          .slice(startIndex, startIndex + take)
          .map((a) => ({ ...a }));
      },
      update: async ({ where, data }) => {
        updateCallCount++;
        if (options.failUpdateAtCallIndex === updateCallCount) {
          throw new Error('fake update failure (simulated crash)');
        }
        updateCalls.push({
          id: where.id,
          numeroCuenta: data.numeroCuenta,
          numeroCuentaBlindIndex: data.numeroCuentaBlindIndex,
        });
        const row = accounts.find((a) => a.id === where.id);
        if (row) {
          row.numeroCuenta = data.numeroCuenta;
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

  return { client, updateCalls, accounts, transactionCalls };
}

describe('partitionBatch — lógica pura (sin I/O)', () => {
  it('cifra + indexa las filas en texto plano y salta las que ya son un ciphertext v1 válido', () => {
    const { crypto, blindIndex } = makeCryptoAndBlindIndex();
    const rows = [
      { id: 'acc-1', numeroCuenta: '  12345-6  ' },
      { id: 'acc-2', numeroCuenta: 'v1:iv:tag:ciphertext' },
    ];

    const { toUpdate, skipped, sospechosas } = partitionBatch(
      rows,
      crypto,
      blindIndex,
    );

    expect(skipped).toBe(1);
    expect(sospechosas).toHaveLength(0);
    expect(toUpdate).toHaveLength(1);
    expect(toUpdate[0].id).toBe('acc-1');
    expect(toUpdate[0].numeroCuentaCifrado.startsWith('v1:')).toBe(true);
    expect(toUpdate[0].numeroCuentaBlindIndex).toBe(
      blindIndex.compute('12345-6'),
    );
  });

  it('normaliza (SOLO trim, sin lowercase) ANTES de cifrar/indexar — numeroCuenta es case-sensitive', () => {
    const { crypto, blindIndex } = makeCryptoAndBlindIndex();
    const rows = [{ id: 'acc-1', numeroCuenta: '  AbC-123  ' }];

    const { toUpdate } = partitionBatch(rows, crypto, blindIndex);

    expect(crypto.decrypt(toUpdate[0].numeroCuentaCifrado)).toBe('AbC-123');
    expect(toUpdate[0].numeroCuentaBlindIndex).toBe(
      blindIndex.compute('AbC-123'),
    );
  });

  it('clasifica como sospechosa (ni cifra ni salta) una fila con prefijo v1: que NO parsea como ciphertext', () => {
    const { crypto, blindIndex } = makeCryptoAndBlindIndex();
    const rows = [
      { id: 'acc-sospechoso', numeroCuenta: 'v1: no-es-un-numero-real' },
    ];

    const { toUpdate, skipped, sospechosas } = partitionBatch(
      rows,
      crypto,
      blindIndex,
    );

    expect(toUpdate).toHaveLength(0);
    expect(skipped).toBe(0);
    expect(sospechosas).toEqual(['acc-sospechoso']);
  });
});

describe('runBackfillNumeroCuentaBlindIndex — cifrado + índice (unit, sin BD)', () => {
  it('un numeroCuenta en texto plano se cifra y se indexa: decrypt() recupera el original y buscar por blind index matchea', async () => {
    const { crypto, blindIndex } = makeCryptoAndBlindIndex();
    const { client, updateCalls, accounts } = makeFakeClient([
      { id: 'acc-1', numeroCuenta: '000000000' },
    ]);

    const summary = await runBackfillNumeroCuentaBlindIndex(
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
    expect(updateCalls[0].numeroCuenta.startsWith('v1:')).toBe(true);
    expect(crypto.decrypt(accounts[0].numeroCuenta)).toBe('000000000');
    expect(updateCalls[0].numeroCuentaBlindIndex).toBe(
      blindIndex.compute('000000000'),
    );
  });

  it('una fila que ya empieza con v1: se SALTA — no se emite ningún update para ella', async () => {
    const { crypto, blindIndex } = makeCryptoAndBlindIndex();
    const yaCifrado = crypto.encrypt('12345-6');
    const { client, updateCalls } = makeFakeClient([
      { id: 'acc-1', numeroCuenta: yaCifrado },
    ]);

    const summary = await runBackfillNumeroCuentaBlindIndex(
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
    const { client, updateCalls, accounts } = makeFakeClient([
      { id: 'acc-1', numeroCuenta: '111' },
      { id: 'acc-2', numeroCuenta: '222' },
    ]);

    const firstRun = await runBackfillNumeroCuentaBlindIndex(
      client,
      crypto,
      blindIndex,
      {
        dryRun: false,
      },
    );
    expect(firstRun.totalEncrypted).toBe(2);
    expect(updateCalls).toHaveLength(2);

    const stateAfterFirstRun = accounts.map((a) => a.numeroCuenta);

    const secondRun = await runBackfillNumeroCuentaBlindIndex(
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
    expect(accounts.map((a) => a.numeroCuenta)).toEqual(stateAfterFirstRun);
  });

  it('resumen correcto en un batch mixto (texto plano + ya cifradas)', async () => {
    const { crypto, blindIndex } = makeCryptoAndBlindIndex();
    const { client } = makeFakeClient([
      { id: 'acc-1', numeroCuenta: '111' },
      { id: 'acc-2', numeroCuenta: crypto.encrypt('222') },
      { id: 'acc-3', numeroCuenta: '333' },
    ]);

    const summary = await runBackfillNumeroCuentaBlindIndex(
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
    const { client, updateCalls, accounts } = makeFakeClient([
      { id: 'acc-1', numeroCuenta: '111' },
    ]);

    const summary = await runBackfillNumeroCuentaBlindIndex(
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
    expect(accounts[0].numeroCuenta).toBe('111');
  });

  it('pagina correctamente por batches (batchSize menor al total de filas) y cifra TODAS', async () => {
    const { crypto, blindIndex } = makeCryptoAndBlindIndex();
    const { client, updateCalls } = makeFakeClient([
      { id: 'acc-1', numeroCuenta: '111' },
      { id: 'acc-2', numeroCuenta: '222' },
      { id: 'acc-3', numeroCuenta: '333' },
      { id: 'acc-4', numeroCuenta: '444' },
      { id: 'acc-5', numeroCuenta: '555' },
    ]);

    const summary = await runBackfillNumeroCuentaBlindIndex(
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

    const summary = await runBackfillNumeroCuentaBlindIndex(
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

  it('fila sospechosa: no se cifra ni se cuenta como ya-cifrada — se reporta aparte y se loguea un WARNING con su id (nunca el numeroCuenta)', async () => {
    const { crypto, blindIndex } = makeCryptoAndBlindIndex();
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const { client, updateCalls, accounts } = makeFakeClient([
      { id: 'acc-normal', numeroCuenta: '111' },
      { id: 'acc-sospechoso', numeroCuenta: 'v1: no-es-ciphertext' },
      { id: 'acc-cifrado', numeroCuenta: crypto.encrypt('222') },
    ]);

    const summary = await runBackfillNumeroCuentaBlindIndex(
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
    expect(updateCalls.map((c) => c.id)).toEqual(['acc-normal']);
    expect(accounts.find((a) => a.id === 'acc-sospechoso')!.numeroCuenta).toBe(
      'v1: no-es-ciphertext',
    );
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const loggedArgs = warnSpy.mock.calls[0].join(' ');
    expect(loggedArgs).toContain('acc-sospechoso');
    expect(loggedArgs).not.toContain('no-es-ciphertext');

    warnSpy.mockRestore();
  });

  it('resumability: si una corrida falla a mitad de camino, una segunda corrida completa solo las filas pendientes', async () => {
    const { crypto, blindIndex } = makeCryptoAndBlindIndex();
    const { client, accounts } = makeFakeClient(
      [
        { id: 'acc-1', numeroCuenta: '111' },
        { id: 'acc-2', numeroCuenta: '222' },
        { id: 'acc-3', numeroCuenta: '333' },
      ],
      { failUpdateAtCallIndex: 2 },
    );

    await expect(
      runBackfillNumeroCuentaBlindIndex(client, crypto, blindIndex, {
        dryRun: false,
      }),
    ).rejects.toThrow(/fake update failure/);

    expect(accounts.find((a) => a.id === 'acc-2')!.numeroCuenta).toBe('222');

    const secondRun = await runBackfillNumeroCuentaBlindIndex(
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

    for (const a of accounts) {
      expect(a.numeroCuenta.startsWith('v1:')).toBe(true);
    }
    expect(
      crypto.decrypt(accounts.find((a) => a.id === 'acc-1')!.numeroCuenta),
    ).toBe('111');
    expect(
      crypto.decrypt(accounts.find((a) => a.id === 'acc-2')!.numeroCuenta),
    ).toBe('222');
    expect(
      crypto.decrypt(accounts.find((a) => a.id === 'acc-3')!.numeroCuenta),
    ).toBe('333');
  });

  it('pasa un timeout y maxWait explícitos a $transaction', async () => {
    const { crypto, blindIndex } = makeCryptoAndBlindIndex();
    const { client, transactionCalls } = makeFakeClient([
      { id: 'acc-1', numeroCuenta: '111' },
    ]);

    await runBackfillNumeroCuentaBlindIndex(client, crypto, blindIndex, {
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

describe('backfill-numero-cuenta-blind-index — gate ALLOW_DESTRUCTIVE_DB / ENCRYPTION_KEY (unit, sin BD)', () => {
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
    process.env.CONFIRM_PROD_BACKFILL = 'us-035-email-blind-index';

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
