import { authAppleTokenRequestSchema } from './auth-apple-token.schema';

describe('authAppleTokenRequestSchema', () => {
  it('acepta { identityToken, nonce } y un nombre opcional', () => {
    expect(
      authAppleTokenRequestSchema.safeParse({
        identityToken: 'a.b.c',
        nonce: 'n',
      }).success,
    ).toBe(true);
    expect(
      authAppleTokenRequestSchema.safeParse({
        identityToken: 'a.b.c',
        nonce: 'n',
        nombre: 'Jorge Retamal',
      }).success,
    ).toBe(true);
  });

  it('acepta nombre null (la app lo manda null después de la primera autorización)', () => {
    expect(
      authAppleTokenRequestSchema.safeParse({
        identityToken: 'a.b.c',
        nonce: 'n',
        nombre: null,
      }).success,
    ).toBe(true);
  });

  it('acepta un authorizationCode opcional (string o null)', () => {
    for (const authorizationCode of ['c-abc.0.xyz', null]) {
      expect(
        authAppleTokenRequestSchema.safeParse({
          identityToken: 'a.b.c',
          nonce: 'n',
          authorizationCode,
        }).success,
      ).toBe(true);
    }
  });

  it.each([
    [{}],
    [{ identityToken: 'a.b.c', nonce: 'n', authorizationCode: 5 }],
    [
      {
        identityToken: 'a.b.c',
        nonce: 'n',
        authorizationCode: 'x'.repeat(3000),
      },
    ],
    [{ identityToken: 'a.b.c' }],
    [{ nonce: 'n' }],
    [{ identityToken: '', nonce: 'n' }],
    [{ identityToken: 'a.b.c', nonce: '' }],
    [{ identityToken: 1, nonce: 'n' }],
    [{ identityToken: 'a.b.c', nonce: 'n', nombre: 5 }],
    [{ identityToken: 'x'.repeat(9000), nonce: 'n' }],
    [{ identityToken: 'a.b.c', nonce: 'n'.repeat(300) }],
    [{ identityToken: 'a.b.c', nonce: 'n', nombre: 'x'.repeat(300) }],
  ])('rechaza %j', (body) => {
    expect(authAppleTokenRequestSchema.safeParse(body).success).toBe(false);
  });
});
