import { createHash, randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

/**
 * session.fixture.ts — US-038 (Phase 12 integration specs).
 *
 * Several new integration specs need a REAL, HTTP-presentable session
 * (`Authorization: Bearer <token>`) for a synthetic test user, WITHOUT going
 * through the password login flow (some test users are demo-flagged and
 * have no `passwordHash`). Mirrors `Sha256SessionTokenService`'s exact
 * hashing (`sha256` hex digest) so the raw token this fixture returns
 * validates against the same `PrismaSessionRepository` lookup the real app
 * uses (`sessionMiddleware` → `ValidarSesionUseCase`).
 */
export async function crearSesionParaUsuario(
  prisma: PrismaClient,
  userId: string,
): Promise<{ token: string; sessionId: string }> {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1h — plenty for one test file's run
    },
  });
  return { token, sessionId: session.id };
}
