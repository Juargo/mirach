import 'dotenv/config';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';

// Issue #105 (RNF-SEC-002, ADR-009 §6): the database is exposed only to the
// API. Supabase's Data API reaches every table in `public` through the anon
// role, so each table keeps RLS enabled without policies. Prisma connects as
// the table owner, which bypasses RLS, so the API is not affected. A new table
// must enable RLS in its own migration or this test fails.
describe('RLS on public tables (real dev DB)', () => {
  const prisma = createPrismaClient(loadEnv());

  // Stand-in for Supabase's anon role: no superuser, no BYPASSRLS, not owner.
  const PROBE_ROLE = 'rls_probe';

  afterAll(async () => {
    await prisma.$executeRawUnsafe(
      `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${PROBE_ROLE}') THEN
         REVOKE ALL ON "BucketPresupuesto" FROM ${PROBE_ROLE};
         DROP ROLE ${PROBE_ROLE};
       END IF; END $$`,
    );
    await prisma.$disconnect();
  });

  it('every table in public has row level security enabled', async () => {
    const tables = await prisma.$queryRaw<
      { tablename: string; rowsecurity: boolean }[]
    >`SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;

    expect(tables.length).toBeGreaterThan(0);
    expect(
      tables.filter((t) => !t.rowsecurity).map((t) => t.tablename),
    ).toEqual([]);
  });

  it('a role granted SELECT but without BYPASSRLS reads no rows', async () => {
    expect(await prisma.bucketPresupuesto.count()).toBeGreaterThan(0);
    await prisma.$executeRawUnsafe(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${PROBE_ROLE}') THEN
         CREATE ROLE ${PROBE_ROLE} NOLOGIN NOSUPERUSER NOBYPASSRLS;
       END IF; END $$`,
    );
    await prisma.$executeRawUnsafe(
      `GRANT SELECT ON "BucketPresupuesto" TO ${PROBE_ROLE}`,
    );

    const visibles = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${PROBE_ROLE}`);
      return tx.$queryRaw<
        { n: bigint }[]
      >`SELECT count(*) AS n FROM "BucketPresupuesto"`;
    });

    expect(visibles[0].n).toBe(0n);
  });
});
