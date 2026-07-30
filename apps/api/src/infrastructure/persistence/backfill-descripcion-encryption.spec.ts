import {
  runBackfillDescripcionEncryption,
  partitionBatch,
  main,
  scrubCredenciales,
  logBackfillFailure,
  type DescripcionBackfillClient,
} from '../../../prisma/backfill-descripcion-encryption';
import { AesGcmCryptoService } from './aes-gcm-crypto.service';
import { buildTestEnv } from '../../../test/support/env.fixture';

/**
 * backfill-descripcion-encryption — unit tests (ADR-013 follow-up, sin BD).
 *
 * `runBackfillDescripcionEncryption` solo depende de un subconjunto
 * estructural de PrismaClient (DescripcionBackfillClient); este fake
 * reproduce findMany (paginado por cursor `id`)/update/$transaction en
 * memoria para poder testear idempotencia y batching sin una conexión
 * Postgres real (mismo patrón que backfill-categorias.spec.ts).
 *
 * Usa la implementación REAL de AesGcmCryptoService (no un fake) con la
 * clave fija de 32 bytes de test/support/env.fixture.ts — así el roundtrip
 * encrypt/decrypt se ejercita de verdad, no solo el orquestador.
 */

function makeCrypto(): AesGcmCryptoService {
  const env = buildTestEnv();
  return new AesGcmCryptoService(Buffer.from(env.ENCRYPTION_KEY, 'base64'));
}

interface FakeTransaccion {
  id: string;
  descripcion: string;
}

function makeFakeClient(
  transacciones: FakeTransaccion[],
  options: { failUpdateAtCallIndex?: number } = {},
) {
  const updateCalls: Array<{ id: string; descripcion: string }> = [];
  const transactionCalls: Array<{
    opsCount: number;
    options: { timeout?: number; maxWait?: number } | undefined;
  }> = [];
  let updateCallCount = 0;

  const client: DescripcionBackfillClient = {
    transaccion: {
      findMany: async ({ where, take }) => {
        const startIndex = where
          ? transacciones.findIndex((t) => t.id === where.id.gt) + 1
          : 0;
        return transacciones
          .slice(startIndex, startIndex + take)
          .map((t) => ({ ...t }));
      },
      update: async ({ where, data }) => {
        updateCallCount++;
        if (options.failUpdateAtCallIndex === updateCallCount) {
          throw new Error('fake update failure (simulated crash)');
        }
        updateCalls.push({ id: where.id, descripcion: data.descripcion });
        const row = transacciones.find((t) => t.id === where.id);
        if (row) row.descripcion = data.descripcion;
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

  return { client, updateCalls, transacciones, transactionCalls };
}

describe('partitionBatch — lógica pura (sin I/O)', () => {
  it('cifra las filas en texto plano y salta las que ya son un ciphertext v1 válido (4 segmentos)', () => {
    const crypto = makeCrypto();
    const rows = [
      { id: 'tx-1', descripcion: 'Compra Lider' },
      // 4 segmentos (v1 + iv + tag + ciphertext) — formato estructuralmente válido.
      { id: 'tx-2', descripcion: 'v1:iv:tag:ciphertext' },
    ];

    const { toUpdate, skipped, sospechosas } = partitionBatch(rows, crypto);

    expect(skipped).toBe(1);
    expect(sospechosas).toHaveLength(0);
    expect(toUpdate).toHaveLength(1);
    expect(toUpdate[0].id).toBe('tx-1');
    expect(toUpdate[0].descripcionCifrada.startsWith('v1:')).toBe(true);
  });

  it('clasifica como sospechosa (ni cifra ni salta) una fila con prefijo v1: que NO parsea como ciphertext (menos de 4 segmentos)', () => {
    const crypto = makeCrypto();
    // 'v1: pago cuenta'.split(':') → ['v1', ' pago cuenta'] — 2 segmentos, no 4.
    const rows = [{ id: 'tx-sospechosa', descripcion: 'v1: pago cuenta' }];

    const { toUpdate, skipped, sospechosas } = partitionBatch(rows, crypto);

    expect(toUpdate).toHaveLength(0);
    expect(skipped).toBe(0);
    expect(sospechosas).toEqual(['tx-sospechosa']);
  });
});

describe('runBackfillDescripcionEncryption — cifrado (unit, sin BD)', () => {
  it('una fila en texto plano se cifra: el resultado empieza con v1: y decrypt() devuelve el original', async () => {
    const crypto = makeCrypto();
    const { client, updateCalls, transacciones } = makeFakeClient([
      { id: 'tx-1', descripcion: 'Compra Lider' },
    ]);

    const summary = await runBackfillDescripcionEncryption(client, crypto, {
      dryRun: false,
    });

    expect(summary).toEqual({
      totalScanned: 1,
      totalEncrypted: 1,
      totalSkippedYaCifradas: 0,
      totalSospechosas: 0,
    });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].descripcion.startsWith('v1:')).toBe(true);
    expect(crypto.decrypt(transacciones[0].descripcion)).toBe('Compra Lider');
  });

  it('una fila que ya empieza con v1: se SALTA — no se emite ningún update para ella', async () => {
    const crypto = makeCrypto();
    const yaCifrada = crypto.encrypt('Sueldo Empresa');
    const { client, updateCalls } = makeFakeClient([
      { id: 'tx-1', descripcion: yaCifrada },
    ]);

    const summary = await runBackfillDescripcionEncryption(client, crypto, {
      dryRun: false,
    });

    expect(summary).toEqual({
      totalScanned: 1,
      totalEncrypted: 0,
      totalSkippedYaCifradas: 1,
      totalSospechosas: 0,
    });
    expect(updateCalls).toHaveLength(0);
  });

  it('idempotencia: correr dos veces sobre el mismo dataset cifra cada fila UNA sola vez — la segunda corrida no emite updates', async () => {
    const crypto = makeCrypto();
    const { client, updateCalls, transacciones } = makeFakeClient([
      { id: 'tx-1', descripcion: 'Compra Lider' },
      { id: 'tx-2', descripcion: 'Sueldo Empresa' },
    ]);

    const firstRun = await runBackfillDescripcionEncryption(client, crypto, {
      dryRun: false,
    });
    expect(firstRun.totalEncrypted).toBe(2);
    expect(updateCalls).toHaveLength(2);

    const ciphertextsAfterFirstRun = transacciones.map((t) => t.descripcion);

    const secondRun = await runBackfillDescripcionEncryption(client, crypto, {
      dryRun: false,
    });

    expect(secondRun).toEqual({
      totalScanned: 2,
      totalEncrypted: 0,
      totalSkippedYaCifradas: 2,
      totalSospechosas: 0,
    });
    // No se emitieron updates nuevos en la segunda corrida.
    expect(updateCalls).toHaveLength(2);
    // El estado no cambió — mismo ciphertext que dejó la primera corrida.
    expect(transacciones.map((t) => t.descripcion)).toEqual(
      ciphertextsAfterFirstRun,
    );
  });

  it('resumen correcto en un batch mixto (texto plano + ya cifradas)', async () => {
    const crypto = makeCrypto();
    const { client } = makeFakeClient([
      { id: 'tx-1', descripcion: 'Compra Lider' },
      { id: 'tx-2', descripcion: crypto.encrypt('Sueldo Empresa') },
      { id: 'tx-3', descripcion: 'Pago Netflix' },
    ]);

    const summary = await runBackfillDescripcionEncryption(client, crypto, {
      dryRun: false,
    });

    expect(summary).toEqual({
      totalScanned: 3,
      totalEncrypted: 2,
      totalSkippedYaCifradas: 1,
      totalSospechosas: 0,
    });
  });

  it('--dry-run calcula el resumen pero no escribe nada', async () => {
    const crypto = makeCrypto();
    const { client, updateCalls, transacciones } = makeFakeClient([
      { id: 'tx-1', descripcion: 'Compra Lider' },
    ]);

    const summary = await runBackfillDescripcionEncryption(client, crypto, {
      dryRun: true,
    });

    expect(summary).toEqual({
      totalScanned: 1,
      totalEncrypted: 1,
      totalSkippedYaCifradas: 0,
      totalSospechosas: 0,
    });
    expect(updateCalls).toHaveLength(0);
    // Nada persistido — sigue en texto plano.
    expect(transacciones[0].descripcion).toBe('Compra Lider');
  });

  it('pagina correctamente por batches (batchSize menor al total de filas) y cifra TODAS', async () => {
    const crypto = makeCrypto();
    const { client, updateCalls } = makeFakeClient([
      { id: 'tx-1', descripcion: 'Compra Lider' },
      { id: 'tx-2', descripcion: 'Sueldo Empresa' },
      { id: 'tx-3', descripcion: 'Pago Netflix' },
      { id: 'tx-4', descripcion: 'Compra Copec' },
      { id: 'tx-5', descripcion: 'Retiro Cajero' },
    ]);

    const summary = await runBackfillDescripcionEncryption(client, crypto, {
      dryRun: false,
      batchSize: 2,
    });

    expect(summary).toEqual({
      totalScanned: 5,
      totalEncrypted: 5,
      totalSkippedYaCifradas: 0,
      totalSospechosas: 0,
    });
    expect(updateCalls).toHaveLength(5);
    expect(new Set(updateCalls.map((c) => c.id))).toEqual(
      new Set(['tx-1', 'tx-2', 'tx-3', 'tx-4', 'tx-5']),
    );
  });

  it('tabla vacía: no escanea nada y no emite updates', async () => {
    const crypto = makeCrypto();
    const { client, updateCalls } = makeFakeClient([]);

    const summary = await runBackfillDescripcionEncryption(client, crypto, {
      dryRun: false,
    });

    expect(summary).toEqual({
      totalScanned: 0,
      totalEncrypted: 0,
      totalSkippedYaCifradas: 0,
      totalSospechosas: 0,
    });
    expect(updateCalls).toHaveLength(0);
  });

  it('fila sospechosa (prefijo v1: no parseable): no se cifra ni se cuenta como ya-cifrada — se reporta aparte y se loguea un WARNING con su id (nunca la descripcion)', async () => {
    const crypto = makeCrypto();
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const { client, updateCalls, transacciones } = makeFakeClient([
      { id: 'tx-normal', descripcion: 'Compra Lider' },
      { id: 'tx-sospechosa', descripcion: 'v1: pago cuenta' },
      { id: 'tx-cifrada', descripcion: crypto.encrypt('Sueldo Empresa') },
    ]);

    const summary = await runBackfillDescripcionEncryption(client, crypto, {
      dryRun: false,
    });

    expect(summary).toEqual({
      totalScanned: 3,
      totalEncrypted: 1,
      totalSkippedYaCifradas: 1,
      totalSospechosas: 1,
    });
    // Solo tx-normal recibió un update — tx-sospechosa NUNCA se cifra.
    expect(updateCalls.map((c) => c.id)).toEqual(['tx-normal']);
    // El estado de la fila sospechosa queda intacto — nunca tocada.
    expect(
      transacciones.find((t) => t.id === 'tx-sospechosa')!.descripcion,
    ).toBe('v1: pago cuenta');
    // WARNING logueado con el id, y la descripcion en texto plano NUNCA
    // aparece en ningún argumento logueado.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const loggedArgs = warnSpy.mock.calls[0].join(' ');
    expect(loggedArgs).toContain('tx-sospechosa');
    expect(loggedArgs).not.toContain('pago cuenta');

    warnSpy.mockRestore();
  });

  it('resumability: si una corrida falla a mitad de camino (update() rechaza en la Nésima llamada), una segunda corrida completa solo las filas pendientes — cada fila termina cifrada exactamente una vez', async () => {
    const crypto = makeCrypto();
    const { client, transacciones } = makeFakeClient(
      [
        { id: 'tx-1', descripcion: 'Compra Lider' },
        { id: 'tx-2', descripcion: 'Sueldo Empresa' },
        { id: 'tx-3', descripcion: 'Pago Netflix' },
      ],
      { failUpdateAtCallIndex: 2 }, // la 2da llamada a update() (tx-2) falla
    );

    await expect(
      runBackfillDescripcionEncryption(client, crypto, { dryRun: false }),
    ).rejects.toThrow(/fake update failure/);

    // tx-2 (la fila cuyo update() falló) sigue en texto plano.
    expect(transacciones.find((t) => t.id === 'tx-2')!.descripcion).toBe(
      'Sueldo Empresa',
    );

    // Segunda corrida: solo la fila pendiente (tx-2) se cifra; las que ya
    // quedaron cifradas se saltan vía el marcador v1: (idempotencia).
    const secondRun = await runBackfillDescripcionEncryption(client, crypto, {
      dryRun: false,
    });

    expect(secondRun.totalScanned).toBe(3);
    expect(secondRun.totalEncrypted).toBeGreaterThanOrEqual(1);
    expect(secondRun.totalSospechosas).toBe(0);

    // Estado final: las 3 filas quedan cifradas, cada una EXACTAMENTE una
    // vez, y decrypt() recupera el texto original de cada una.
    for (const t of transacciones) {
      expect(t.descripcion.startsWith('v1:')).toBe(true);
    }
    expect(
      crypto.decrypt(transacciones.find((t) => t.id === 'tx-1')!.descripcion),
    ).toBe('Compra Lider');
    expect(
      crypto.decrypt(transacciones.find((t) => t.id === 'tx-2')!.descripcion),
    ).toBe('Sueldo Empresa');
    expect(
      crypto.decrypt(transacciones.find((t) => t.id === 'tx-3')!.descripcion),
    ).toBe('Pago Netflix');
  });

  it('pasa un timeout y maxWait explícitos a $transaction (batch de 500+ updates sobre el pooler no debe toparse con el default de 5s de Prisma)', async () => {
    const crypto = makeCrypto();
    const { client, transactionCalls } = makeFakeClient([
      { id: 'tx-1', descripcion: 'Compra Lider' },
    ]);

    await runBackfillDescripcionEncryption(client, crypto, { dryRun: false });

    expect(transactionCalls).toHaveLength(1);
    expect(transactionCalls[0].options?.timeout).toBeGreaterThan(5000);
    expect(transactionCalls[0].options?.maxWait).toBeGreaterThan(0);
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
    error.stack = error.message; // sin stack trace real — simplifica el assert

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

describe('backfill-descripcion-encryption — gate ALLOW_DESTRUCTIVE_DB / ENCRYPTION_KEY (unit, sin BD)', () => {
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
    // Valor del backfill de categorías, NO el de este script.
    process.env.CONFIRM_PROD_BACKFILL = 'us-013-transaccion-categorias';

    await expect(main([])).rejects.toThrow(/producción/);
  });

  it('sin DATABASE_URL/DIRECT_URL definidos, falla antes de intentar conectar', async () => {
    process.env.ALLOW_DESTRUCTIVE_DB = '1';
    delete process.env.DATABASE_URL;
    delete process.env.DIRECT_URL;

    await expect(main([])).rejects.toThrow(/DATABASE_URL|DIRECT_URL/);
  });

  it('con el gate de BD superado pero sin ENCRYPTION_KEY, falla antes de construir el crypto service', async () => {
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
    process.env.ENCRYPTION_KEY = Buffer.alloc(16, 1).toString('base64'); // 16 bytes, no 32

    await expect(main([])).rejects.toThrow(/ENCRYPTION_KEY/);
  });
});
