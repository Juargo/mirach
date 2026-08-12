/**
 * demo-lifecycle.int-spec.ts — US-037 (3.7): demo user creation + expiry
 * against the real (ephemeral local) Postgres.
 *
 * Requires:
 *  - A real dev/test Postgres DB (`.env.test`, see docs/local-test-db.md)
 *  - ALLOW_DESTRUCTIVE_DB=1
 *  - The us037_catalogo_per_user migration applied
 *
 * Gate: assertDestructiveDbAllowed() runs in integration.setup.ts.
 * Run via `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration demo-lifecycle`.
 *
 * Covers CAT037-02 (atomic copy-on-creation, all-or-nothing) and CAT037-07
 * (cleanup leaves no orphan catalog rows, no FK violation) — design.md §6.
 */
import 'dotenv/config';
import type { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { PrismaDemoRepository } from '../src/infrastructure/persistence/prisma-demo.repository';
import { DemoCleanupService } from '../src/infrastructure/http/auth/demo-cleanup.service';
import { AesGcmCryptoService } from '../src/infrastructure/persistence/aes-gcm-crypto.service';
import { HmacBlindIndexService } from '../src/infrastructure/persistence/hmac-blind-index.service';
import { deriveBlindIndexKey } from '../src/composition/derive-blind-index-key';
import { SystemReloj } from '../src/infrastructure/http/auth/system-reloj';
import { IReloj } from '../src/application/ports/reloj.port';
import {
  CATEGORIA_TEMPLATE_SIZE,
  PATRON_TEMPLATE_SIZE,
} from '../src/infrastructure/persistence/catalogo-template';
import { TTL_SESION_MS } from '../src/domain/value-objects/duracion-sesion';

const RUN_ID = `demo-lifecycle-int-${Date.now()}`;

function makeReloj(fixedNow: Date): IReloj {
  return { ahora: () => fixedNow };
}

describe('Demo lifecycle — catalog copy-on-creation + expiry cleanup (CAT037-02, CAT037-07)', () => {
  let prisma: PrismaClient;
  let repo: PrismaDemoRepository;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();

    const crypto = new AesGcmCryptoService(
      Buffer.from(env.ENCRYPTION_KEY, 'base64'),
    );
    const blindIndex = new HmacBlindIndexService(
      deriveBlindIndexKey(Buffer.from(env.ENCRYPTION_KEY, 'base64')),
    );
    repo = new PrismaDemoRepository(
      prisma,
      new SystemReloj(),
      crypto,
      blindIndex,
    );
  });

  afterAll(async () => {
    // Cleanup mirrors DemoCleanupService's own ordering (belt-and-braces —
    // borrarExpirados() already removed the users covered by its own test,
    // this catches anything a failed assertion left behind).
    if (createdUserIds.length > 0) {
      await prisma.session.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.transaccion.deleteMany({
        where: { account: { userId: { in: createdUserIds } } },
      });
      await prisma.ingesta.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.patronClasificacion.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.categoria.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.account.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  it('CAT037-02: a new demo user owns exactly 8 Categoria + 20 PatronClasificacion rows, created atomically with the user', async () => {
    const result = await repo.crear({
      nombre: `Demo-${RUN_ID}-a`,
      tokenHash: `${RUN_ID}-token-a`,
      expiresAt: new Date(Date.now() + TTL_SESION_MS),
    });
    createdUserIds.push(result.userId);

    const categoriaCount = await prisma.categoria.count({
      where: { userId: result.userId },
    });
    const patronCount = await prisma.patronClasificacion.count({
      where: { userId: result.userId },
    });

    expect(categoriaCount).toBe(CATEGORIA_TEMPLATE_SIZE);
    expect(patronCount).toBe(PATRON_TEMPLATE_SIZE);

    // The composite FK invariant (D-06): every copied pattern's categoriaId
    // resolves to a Categoria row owned by the SAME userId.
    const patrones = await prisma.patronClasificacion.findMany({
      where: { userId: result.userId },
      include: { categoria: { select: { userId: true } } },
    });
    for (const patron of patrones) {
      expect(patron.categoria.userId).toBe(result.userId);
    }
  });

  it('CAT037-02: a forced transaction failure (duplicate tokenHash) leaves ZERO new rows — no orphan user, account, catalog or session', async () => {
    // Reserve a tokenHash via a first successful demo creation, then reuse
    // it — Session.tokenHash is @unique, so the SECOND crear() call fails
    // at tx.session.create (the LAST step), proving the catalog copy that
    // already ran earlier in that same transaction is rolled back too.
    const reserved = await repo.crear({
      nombre: `Demo-${RUN_ID}-b-reserved`,
      tokenHash: `${RUN_ID}-token-b`,
      expiresAt: new Date(Date.now() + TTL_SESION_MS),
    });
    createdUserIds.push(reserved.userId);

    const [beforeUser, beforeAccount, beforeCategoria, beforePatron] =
      await Promise.all([
        prisma.user.count({ where: { esDemo: true } }),
        prisma.account.count(),
        prisma.categoria.count(),
        prisma.patronClasificacion.count(),
      ]);

    await expect(
      repo.crear({
        nombre: `Demo-${RUN_ID}-b-forced-failure`,
        tokenHash: `${RUN_ID}-token-b`, // duplicate — violates @unique
        expiresAt: new Date(Date.now() + TTL_SESION_MS),
      }),
    ).rejects.toThrow();

    expect(await prisma.user.count({ where: { esDemo: true } })).toBe(
      beforeUser,
    );
    expect(await prisma.account.count()).toBe(beforeAccount);
    expect(await prisma.categoria.count()).toBe(beforeCategoria);
    expect(await prisma.patronClasificacion.count()).toBe(beforePatron);
  });

  it('CAT037-07: after borrarExpirados() on an expired demo user, no FK violation and zero orphan Categoria/PatronClasificacion rows remain', async () => {
    const eightDaysAgo = new Date(
      Date.now() - TTL_SESION_MS - 24 * 60 * 60 * 1000,
    );
    const result = await repo.crear({
      nombre: `Demo-${RUN_ID}-c-expiring`,
      tokenHash: `${RUN_ID}-token-c`,
      expiresAt: new Date(Date.now() + TTL_SESION_MS),
    });
    createdUserIds.push(result.userId);

    // Backdate demoCreatedAt directly — PrismaDemoRepository always stamps
    // "now" via its own reloj, so expiry is simulated post-hoc, same
    // technique other demo-cleanup-adjacent specs use.
    await prisma.user.update({
      where: { id: result.userId },
      data: { demoCreatedAt: eightDaysAgo },
    });

    const cleanup = new DemoCleanupService(prisma, makeReloj(new Date()));
    await expect(cleanup.borrarExpirados()).resolves.toBeGreaterThanOrEqual(1);

    expect(
      await prisma.categoria.count({ where: { userId: result.userId } }),
    ).toBe(0);
    expect(
      await prisma.patronClasificacion.count({
        where: { userId: result.userId },
      }),
    ).toBe(0);
    expect(await prisma.user.count({ where: { id: result.userId } })).toBe(0);
  });
});
