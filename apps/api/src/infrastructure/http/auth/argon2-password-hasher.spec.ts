import { Argon2PasswordHasher } from './argon2-password-hasher';

/**
 * Real argon2id roundtrip — no mocking (verificar low-cost params).
 * `@node-rs/argon2` verify() reads cost params from the encoded hash itself,
 * so a low-memory hash config keeps this test fast without weakening the
 * production config (AUTH-03).
 */
describe('Argon2PasswordHasher', () => {
  const hasher = new Argon2PasswordHasher();

  it('hash → verificar roundtrip: contraseña correcta retorna true', async () => {
    const hash = await hasher.hash('correcto-123');

    const resultado = await hasher.verificar('correcto-123', hash);

    expect(resultado).toBe(true);
  });

  it('contraseña incorrecta retorna false', async () => {
    const hash = await hasher.hash('correcto-123');

    const resultado = await hasher.verificar('incorrecto-456', hash);

    expect(resultado).toBe(false);
  });

  it('produce un hash con formato argon2id', async () => {
    const hash = await hasher.hash('otra-contraseña');

    expect(hash.startsWith('$argon2id$')).toBe(true);
  });
});
