import { readFileSync } from 'fs';
import { join } from 'path';
import type { PrismaClient } from '@prisma/client';
import { crearPreviewIngesta } from './crear-preview-ingesta';
import type { ICryptoService } from '../application/ports/crypto-service.port';
import type { IBlindIndexService } from '../application/ports/blind-index-service.port';
import { NoOpLogger } from '../../test/support/logger.double';
import { IFileReader } from '../application/ports/file-reader.port';

// ---------------------------------------------------------------------------
// T-25 MANDATORY-BLOCKING — no-write composition test (D-12, §6 item 14a)
//
// Mechanism (design §7 — "proxy over all models/methods"):
//   1. Build a Prisma stub backed by a JS Proxy. Every model property access
//      returns a Proxy whose method access THROWS unless (model, method) is in
//      the explicit ALLOWLIST. Top-level members ($transaction, $queryRaw,
//      $executeRaw, unknown models) also THROW — none are allowlisted.
//   2. ALLOWLIST (verified against actual adapter implementations):
//      - account.findUnique           (PrismaAccountReader)
//      - transaccion.findMany         (PrismaTransaccionExistenteReader)
//      - patronClasificacion.findMany (PrismaCatalogoClasificacionRepository)
//   3. Because the Proxy denies by default, this catches ANY future write
//      adapter (account.create, ingesta.upsert, transaccion.createMany, …) —
//      not just a hand-enumerated denylist.
//   4. Execute crearPreviewIngesta(proxy, crypto, blindIndex, logger) then
//      await previewIngesta.execute({fileReader, userId}).
//   5. A successful Result PROVES no forbidden access occurred (any write throws
//      through the Proxy → Result.fail).
//
// This test is the BLOCKING MERGE GATE for PR4 — PR4 MUST NOT merge without
// this test passing (design D-12, §7).
// ---------------------------------------------------------------------------

const FIXTURE_PATH = join(
  __dirname,
  '../../test/fixtures/movimientos-test.xlsx',
);

/**
 * FakeFileReader backed by the BCI real fixture (movimientos-test.xlsx).
 * The fixture is a real BCI cartola that the pipeline can parse successfully,
 * giving the no-write test a real happy path through the graph.
 */
class FakeFileReaderWithValidCartola implements IFileReader {
  private readonly buffer: Buffer;

  constructor() {
    this.buffer = readFileSync(FIXTURE_PATH);
  }

  getBuffer(): Buffer {
    return this.buffer;
  }

  getOriginalName(): string {
    return 'movimientos-test.xlsx';
  }

  getSizeInBytes(): number {
    return this.buffer.length;
  }
}

/**
 * ALLOWLIST — the ONLY (model, method) pairs the preview read adapters may call.
 * Verified against the real adapter implementations:
 *   - account.findUnique           → PrismaAccountReader.findByBanco
 *   - transaccion.findMany         → PrismaTransaccionExistenteReader.buscarPorCuentaYRango
 *   - patronClasificacion.findMany → PrismaCatalogoClasificacionRepository.findAll
 * Each returns an empty/null result the adapters handle gracefully.
 *
 * Any (model, method) NOT in this map — ANY future write adapter such as
 * `ingesta.upsert`, `account.create`, `transaccion.createMany`, etc. — THROWS.
 */
const ALLOWLIST: Record<
  string,
  Record<string, (...args: unknown[]) => Promise<unknown>>
> = {
  account: { findUnique: () => Promise.resolve(null) },
  transaccion: { findMany: () => Promise.resolve([]) },
  patronClasificacion: { findMany: () => Promise.resolve([]) },
};

/** Recording of every (model, method) access — for post-run assertions. */
interface AccessLog {
  calls: Array<{ model: string; method: string }>;
  called(model: string, method: string): boolean;
}

/**
 * buildProxyStubPrisma — Prisma stub backed by a JS Proxy over ALL models AND
 * all top-level members. Every model property access returns a Proxy whose
 * method access THROWS unless (model, method) is in the ALLOWLIST. Top-level
 * members ($transaction, $queryRaw, $executeRaw, etc.) also THROW (none are
 * allowlisted). This makes the no-write guarantee catch ANY future write
 * adapter, not just a hand-enumerated denylist (design §7 "proxy over all
 * models/methods").
 */
function buildProxyStubPrisma(): { prisma: PrismaClient; log: AccessLog } {
  const calls: Array<{ model: string; method: string }> = [];

  const modelProxy = (model: string) =>
    new Proxy(
      {},
      {
        get(_t, methodProp: string | symbol) {
          const method = String(methodProp);
          const allowed = ALLOWLIST[model]?.[method];
          if (allowed === undefined) {
            throw new Error(
              `FORBIDDEN prisma access in preview: ${model}.${method} ` +
                `is not in the read ALLOWLIST`,
            );
          }
          // Wrap the allowed impl so we record the call for assertions.
          return (...args: unknown[]) => {
            calls.push({ model, method });
            return allowed(...args);
          };
        },
      },
    );

  const rootProxy = new Proxy(
    {},
    {
      get(_t, prop: string | symbol) {
        const key = String(prop);
        // Promise/thenable interop: never treat the stub itself as awaitable.
        if (key === 'then') return undefined;
        if (key in ALLOWLIST) {
          return modelProxy(key);
        }
        // Top-level members ($transaction, $queryRaw, $connect, unknown models)
        // are all forbidden — none are allowlisted.
        throw new Error(
          `FORBIDDEN prisma access in preview: top-level "${key}" ` +
            `is not allowlisted`,
        );
      },
    },
  ) as unknown as PrismaClient;

  return {
    prisma: rootProxy,
    log: {
      calls,
      called: (model, method) =>
        calls.some((c) => c.model === model && c.method === method),
    },
  };
}

function fakeCrypto(): ICryptoService {
  return {
    encrypt: (v: string) => `enc:${v}`,
    decrypt: (v: string) => (v.startsWith('enc:') ? v.slice(4) : v),
  };
}

function fakeBlindIndex(): IBlindIndexService {
  return {
    compute: (v: string) => `blind:${v}`,
  };
}

describe('crearPreviewIngesta — no-write composition test (T-25 MANDATORY-BLOCKING)', () => {
  it('executes the full preview happy path through the Proxy without any forbidden access', async () => {
    const { prisma, log } = buildProxyStubPrisma();
    const previewIngesta = crearPreviewIngesta(
      prisma,
      fakeCrypto(),
      fakeBlindIndex(),
      new NoOpLogger(),
    );

    const fileReader = new FakeFileReaderWithValidCartola();
    const userId = 'user-test-no-write';

    // If the graph reached ANY non-allowlisted (model, method) — including a
    // future write adapter — the Proxy would throw and this Result would fail.
    const result = await previewIngesta.execute({ fileReader, userId });

    // Success PROVES no forbidden access occurred (any write throws in the Proxy).
    expect(result.isOk()).toBe(true);

    // Positive read invariant: the only surfaces touched are the allowlisted reads.
    for (const { model, method } of log.calls) {
      expect(ALLOWLIST[model]?.[method]).toBeDefined();
    }
  });

  it('catches a hypothetical write access: a forbidden (model, method) throws through the Proxy', () => {
    // This locks the Proxy mechanism itself — proving it would catch ANY future
    // write adapter (e.g. account.create, ingesta.upsert, transaccion.createMany).
    const { prisma } = buildProxyStubPrisma();
    const p = prisma as unknown as Record<string, Record<string, unknown>>;

    expect(() => p.account.create).toThrow(/FORBIDDEN prisma access/);
    expect(() => p.ingesta.upsert).toThrow(/FORBIDDEN prisma access/);
    expect(() => p.transaccion.createMany).toThrow(/FORBIDDEN prisma access/);
    // Top-level members are forbidden too — none are allowlisted.
    expect(
      () => (prisma as unknown as { $transaction: unknown }).$transaction,
    ).toThrow(/FORBIDDEN prisma access/);
  });

  it('only the allowlisted read surfaces are actually exercised on the happy path', async () => {
    const { prisma, log } = buildProxyStubPrisma();
    const previewIngesta = crearPreviewIngesta(
      prisma,
      fakeCrypto(),
      fakeBlindIndex(),
      new NoOpLogger(),
    );

    await previewIngesta.execute({
      fileReader: new FakeFileReaderWithValidCartola(),
      userId: 'user-read-only-check',
    });

    // account.findUnique is reached (PrismaAccountReader.findByBanco); with a
    // null account the reader short-circuits so the tx reader may not be queried
    // — but whatever IS queried must be an allowlisted read.
    expect(log.called('account', 'findUnique')).toBe(true);
    for (const { model, method } of log.calls) {
      expect(ALLOWLIST[model]?.[method]).toBeDefined();
    }
  });

  it('repeated calls stay Ok — the no-write guarantee holds across invocations', async () => {
    const { prisma } = buildProxyStubPrisma();
    const previewIngesta = crearPreviewIngesta(
      prisma,
      fakeCrypto(),
      fakeBlindIndex(),
      new NoOpLogger(),
    );

    const r1 = await previewIngesta.execute({
      fileReader: new FakeFileReaderWithValidCartola(),
      userId: 'u1',
    });
    const r2 = await previewIngesta.execute({
      fileReader: new FakeFileReaderWithValidCartola(),
      userId: 'u2',
    });

    // Any forbidden access in either run would have thrown → Result.fail.
    expect(r1.isOk()).toBe(true);
    expect(r2.isOk()).toBe(true);
  });
});
