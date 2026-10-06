import type { PrismaClient } from '@prisma/client';

import { PrismaRefreshTokenAppleRepository } from './prisma-refresh-token-apple.repository';
import type { ICryptoService } from '../../application/ports/crypto-service.port';

const crypto: ICryptoService = {
  encrypt: (v) => `enc:${v}`,
  decrypt: (v) => v.replace(/^enc:/, ''),
};

function repoCon(prisma: unknown) {
  return new PrismaRefreshTokenAppleRepository(prisma as PrismaClient, crypto);
}

describe('PrismaRefreshTokenAppleRepository', () => {
  it('guardar cifra el token y lo escribe acotado por userId (nunca en claro)', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });

    await repoCon({ user: { updateMany } }).guardar('user-1', 'rt-secreto');

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { appleRefreshToken: 'enc:rt-secreto' },
    });
    expect(JSON.stringify(updateMany.mock.calls)).not.toContain('"rt-secreto"');
  });

  it('obtener descifra el token guardado', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValue({ appleRefreshToken: 'enc:rt-secreto' });

    const token = await repoCon({ user: { findUnique } }).obtener('user-1');

    expect(token).toBe('rt-secreto');
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { appleRefreshToken: true },
    });
  });

  it.each([
    ['usuario inexistente', null],
    ['sin token guardado', { appleRefreshToken: null }],
  ])('obtener → null: %s', async (_nombre, fila) => {
    const findUnique = vi.fn().mockResolvedValue(fila);

    expect(await repoCon({ user: { findUnique } }).obtener('u')).toBeNull();
  });
});
