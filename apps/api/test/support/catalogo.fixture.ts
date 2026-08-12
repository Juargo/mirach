import { copiarCatalogoTemplate } from '../../src/infrastructure/persistence/catalogo-template';
import type { CatalogoTemplateClient } from '../../src/infrastructure/persistence/catalogo-template';

/**
 * catalogo.fixture.ts — US-037 Phase 6 (design.md §9.2).
 *
 * Every existing `*.int-spec.ts` creates its test users with a direct
 * `prisma.user.create` (there is no signup HTTP path to go through in these
 * tests) — since `Categoria.userId`/`PatronClasificacion.userId` are NOT
 * NULL post-migration, any test that assigns a `categoriaId` to a
 * `Transaccion` for one of these synthetic users needs that user to own a
 * real catalog first, or the write fails the composite FK.
 *
 * `crearCatalogoParaUsuario` is a thin, intention-revealing wrapper over
 * `copiarCatalogoTemplate` (the same primitive `PrismaDemoRepository.crear`
 * uses) — kept separate so int-specs read "give this test user a catalog"
 * instead of reaching for the lower-level template primitive directly.
 */
export async function crearCatalogoParaUsuario(
  prisma: CatalogoTemplateClient,
  userId: string,
): Promise<void> {
  await copiarCatalogoTemplate(prisma, userId);
}
