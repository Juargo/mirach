import { createPrismaClient } from './create-prisma-client';

/**
 * createPrismaClient — factory de un PrismaClient plano (sin ciclo de vida de
 * Nest). La invariante que importa acá es la misma que protegía PrismaService:
 * negarse a arrancar sin cadena de conexión, en vez de fallar opaco al primer
 * query. Es infraestructura: lanzar por config ausente es aceptable.
 */
describe('createPrismaClient', () => {
  const original = {
    db: process.env.DATABASE_URL,
    direct: process.env.DIRECT_URL,
  };

  afterEach(() => {
    process.env.DATABASE_URL = original.db;
    process.env.DIRECT_URL = original.direct;
  });

  it('lanza si no hay DATABASE_URL ni DIRECT_URL', () => {
    delete process.env.DATABASE_URL;
    delete process.env.DIRECT_URL;

    expect(() => createPrismaClient()).toThrow(/DATABASE_URL|DIRECT_URL/);
  });
});
