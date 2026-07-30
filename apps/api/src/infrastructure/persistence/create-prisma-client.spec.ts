import { createPrismaClient } from './create-prisma-client';

/**
 * createPrismaClient — factory de un PrismaClient plano (sin ciclo de vida de
 * Nest). Tras ADR-029 recibe `env` inyectado (Pick<Env,'DATABASE_URL'|'DIRECT_URL'>)
 * en vez de leer `process.env` directamente — el read point se mueve al boot
 * (server.ts → loadEnv()). La invariante que importa acá es la misma que
 * protegía PrismaService: negarse a arrancar sin cadena de conexión, en vez de
 * fallar opaco al primer query. `PrismaPg`/`PrismaClient` se mockean para que
 * el test sea hermético (sin conexión real) y para poder espiar la cadena de
 * conexión que efectivamente se resuelve (precedencia DIRECT_URL).
 */
const prismaPgCtor = vi.fn();
const prismaClientCtor = vi.fn();

vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: class {
    constructor(connectionString: string) {
      prismaPgCtor(connectionString);
    }
  },
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    constructor(options: unknown) {
      prismaClientCtor(options);
    }
  },
}));

describe('createPrismaClient', () => {
  beforeEach(() => {
    prismaPgCtor.mockClear();
    prismaClientCtor.mockClear();
  });

  it('lanza si DATABASE_URL y DIRECT_URL resuelven a cadena vacía', () => {
    expect(() =>
      createPrismaClient({ DATABASE_URL: '', DIRECT_URL: undefined }),
    ).toThrow(/DATABASE_URL|DIRECT_URL/);
  });

  it('usa DIRECT_URL con precedencia sobre DATABASE_URL cuando ambos están presentes', () => {
    createPrismaClient({
      DATABASE_URL: 'postgres://pooler-host/db',
      DIRECT_URL: 'postgres://direct-host/db',
    });

    expect(prismaPgCtor).toHaveBeenCalledWith('postgres://direct-host/db');
  });

  it('usa DATABASE_URL cuando DIRECT_URL está ausente', () => {
    createPrismaClient({
      DATABASE_URL: 'postgres://pooler-host/db',
      DIRECT_URL: undefined,
    });

    expect(prismaPgCtor).toHaveBeenCalledWith('postgres://pooler-host/db');
  });
});
