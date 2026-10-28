-- Issue #105 (RNF-SEC-002, ADR-009 §6): the database is exposed only to the
-- API. Supabase's Data API (PostgREST) reaches every table in `public` through
-- the anon and authenticated roles; on 2026-10-28 a publishable-key request
-- returned rows from "Categoria". The Data API is disabled in the dashboard;
-- this is defense in depth in case it comes back.
-- RLS without policies denies every non-owner role. Prisma connects as the
-- table owner (`postgres`), which bypasses RLS, so the API is not affected.
-- No FORCE ROW LEVEL SECURITY: that would also block the owner.
-- Every new table must enable RLS in its own migration
-- (test/rls-tablas-publicas.int-spec.ts fails otherwise).

ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Ingesta" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Transaccion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BucketPresupuesto" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Categoria" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PatronClasificacion" ENABLE ROW LEVEL SECURITY;
