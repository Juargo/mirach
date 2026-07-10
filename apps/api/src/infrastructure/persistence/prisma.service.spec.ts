import { PrismaService } from './prisma.service';

/**
 * Cubre solo la lógica pura del constructor (resolución de la cadena de
 * conexión y guarda por configuración ausente). NO abre ninguna conexión:
 * el guard lanza antes de construir el adapter / cliente.
 */
describe('PrismaService config guard', () => {
  const original = {
    DIRECT_URL: process.env.DIRECT_URL,
    DATABASE_URL: process.env.DATABASE_URL,
  };

  const restore = (key: 'DIRECT_URL' | 'DATABASE_URL', value?: string): void => {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  };

  afterEach(() => {
    restore('DIRECT_URL', original.DIRECT_URL);
    restore('DATABASE_URL', original.DATABASE_URL);
  });

  it('lanza un error claro cuando faltan DIRECT_URL y DATABASE_URL', () => {
    delete process.env.DIRECT_URL;
    delete process.env.DATABASE_URL;

    expect(() => new PrismaService()).toThrow(/DATABASE_URL o DIRECT_URL/);
  });
});
