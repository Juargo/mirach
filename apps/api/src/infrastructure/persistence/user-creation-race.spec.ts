import { Prisma } from '@prisma/client';

import { esCarreraDeCreacionUser } from './user-creation-race';

function p2002(meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.8.0',
    meta,
  });
}

describe('esCarreraDeCreacionUser', () => {
  const COLUMNAS = ['emailBlindIndex', 'appleSub'];

  it('target ausente → carrera (conservador)', () => {
    expect(esCarreraDeCreacionUser(p2002(), COLUMNAS)).toBe(true);
  });

  it('target que nombra una columna esperada → carrera', () => {
    expect(
      esCarreraDeCreacionUser(p2002({ target: ['appleSub'] }), COLUMNAS),
    ).toBe(true);
    expect(
      esCarreraDeCreacionUser(
        p2002({ target: 'User_emailBlindIndex_key' }),
        COLUMNAS,
      ),
    ).toBe(true);
  });

  it('target que nombra solo una columna ajena → no es carrera', () => {
    expect(
      esCarreraDeCreacionUser(p2002({ target: ['nombre'] }), COLUMNAS),
    ).toBe(false);
  });
});
