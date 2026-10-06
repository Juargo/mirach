import { createHash } from 'node:crypto';
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type CryptoKey,
  type JWK,
  type JWTPayload,
} from 'jose';

import {
  APPLE_ISSUER,
  APPLE_JWKS_URL,
  AppleIdTokenVerifier,
} from './apple-id-token.adapter';

// Unit tests — AppleIdTokenVerifier. Sin red: las claves RSA se generan acá
// y el JWKS es un `createLocalJWKSet` en memoria.

const BUNDLE_ID = 'cl.mirach.app';
const NONCE_CRUDO = 'nonce-crudo-de-la-app';
const NONCE_HASH = createHash('sha256').update(NONCE_CRUDO).digest('hex');
const AHORA = new Date('2026-10-04T12:00:00.000Z');

interface Par {
  privateKey: CryptoKey;
  jwk: JWK;
}

async function crearPar(kid: string): Promise<Par> {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  return { privateKey, jwk: { ...jwk, kid, alg: 'RS256', use: 'sig' } };
}

interface Opciones {
  kid?: string;
  claims?: JWTPayload;
  issuer?: string;
  audience?: string;
  exp?: number;
  firmarCon?: CryptoKey;
}

async function firmar(par: Par, o: Opciones = {}): Promise<string> {
  const jwt = new SignJWT({
    nonce: NONCE_HASH,
    email: 'jorge@example.com',
    email_verified: true,
    ...o.claims,
  })
    .setProtectedHeader({ alg: 'RS256', kid: o.kid ?? par.jwk.kid })
    .setSubject('apple-sub-1')
    .setIssuer(o.issuer ?? APPLE_ISSUER)
    .setAudience(o.audience ?? BUNDLE_ID)
    .setIssuedAt(Math.floor(AHORA.getTime() / 1000))
    .setExpirationTime(o.exp ?? Math.floor(AHORA.getTime() / 1000) + 600);
  return jwt.sign(o.firmarCon ?? par.privateKey);
}

function verificador(par: Par) {
  return new AppleIdTokenVerifier(
    BUNDLE_ID,
    createLocalJWKSet({ keys: [par.jwk] }),
    () => AHORA,
  );
}

describe('AppleIdTokenVerifier', () => {
  let par: Par;
  beforeAll(async () => {
    par = await crearPar('kid-1');
  });

  it('apunta al JWKS y al issuer documentados por Apple', () => {
    expect(APPLE_JWKS_URL.href).toBe('https://appleid.apple.com/auth/keys');
    expect(APPLE_ISSUER).toBe('https://appleid.apple.com');
  });

  it('token válido → identidad con sub, email y email verificado', async () => {
    const r = await verificador(par).verificarIdToken(
      await firmar(par),
      NONCE_CRUDO,
    );

    expect(r.isOk()).toBe(true);
    expect(r.getValue()).toEqual({
      sub: 'apple-sub-1',
      email: 'jorge@example.com',
      emailVerificado: true,
      emailPrivado: false,
    });
  });

  it.each([
    ['true', true],
    [true, true],
    ['false', false],
    [false, false],
    [undefined, false],
    ['yes', false],
  ])('email_verified %j → emailVerificado %s', async (valor, esperado) => {
    const token = await firmar(par, { claims: { email_verified: valor } });

    const r = await verificador(par).verificarIdToken(token, NONCE_CRUDO);

    expect(r.getValue().emailVerificado).toBe(esperado);
  });

  it.each([
    ['true', true],
    [true, true],
    ['false', false],
    [false, false],
  ])('is_private_email %j → emailPrivado %s', async (valor, esperado) => {
    const token = await firmar(par, { claims: { is_private_email: valor } });

    const r = await verificador(par).verificarIdToken(token, NONCE_CRUDO);

    expect(r.getValue().emailPrivado).toBe(esperado);
  });

  it('un email del dominio privaterelay.appleid.com es privado aunque el claim falte', async () => {
    const token = await firmar(par, {
      claims: { email: 'abc123@privaterelay.appleid.com' },
    });

    const r = await verificador(par).verificarIdToken(token, NONCE_CRUDO);

    expect(r.getValue().emailPrivado).toBe(true);
  });

  it('sin claim email → email null', async () => {
    const token = await firmar(par, { claims: { email: undefined } });

    const r = await verificador(par).verificarIdToken(token, NONCE_CRUDO);

    expect(r.isOk()).toBe(true);
    expect(r.getValue().email).toBeNull();
  });

  describe('fallas — siempre Result.fail, nunca una excepción', () => {
    async function falla(token: string, nonce = NONCE_CRUDO) {
      const r = await verificador(par).verificarIdToken(token, nonce);
      expect(r.isFail()).toBe(true);
      return r.getError();
    }

    it('issuer incorrecto', async () => {
      await falla(await firmar(par, { issuer: 'https://evil.example.com' }));
    });

    it('audience incorrecta', async () => {
      await falla(await firmar(par, { audience: 'cl.otro.app' }));
    });

    it('token expirado', async () => {
      const exp = Math.floor(AHORA.getTime() / 1000) - 60;
      await falla(await firmar(par, { exp }));
    });

    it('firmado con otra clave (firma inválida)', async () => {
      const otro = await crearPar('kid-1');
      await falla(await firmar(par, { firmarCon: otro.privateKey }));
    });

    it('kid desconocido', async () => {
      await falla(await firmar(par, { kid: 'kid-que-no-existe' }));
    });

    it('nonce que no corresponde', async () => {
      await falla(await firmar(par), 'otro-nonce');
    });

    it('token sin claim nonce', async () => {
      await falla(await firmar(par, { claims: { nonce: undefined } }));
    });

    it('nonce crudo en vacío', async () => {
      await falla(await firmar(par), '');
    });

    it('token firmado con HS256 (confusión de algoritmo)', async () => {
      const hs = await new SignJWT({ nonce: NONCE_HASH })
        .setProtectedHeader({ alg: 'HS256', kid: 'kid-1' })
        .setSubject('s')
        .setIssuer(APPLE_ISSUER)
        .setAudience(BUNDLE_ID)
        .setExpirationTime('10m')
        .sign(new TextEncoder().encode('x'.repeat(32)));
      await falla(hs);
    });

    it('token sin sub', async () => {
      const sinSub = await new SignJWT({ nonce: NONCE_HASH })
        .setProtectedHeader({ alg: 'RS256', kid: 'kid-1' })
        .setIssuer(APPLE_ISSUER)
        .setAudience(BUNDLE_ID)
        .setExpirationTime(Math.floor(AHORA.getTime() / 1000) + 600)
        .sign(par.privateKey);
      await falla(sinSub);
    });

    it.each(['', '   ', 'no-es-un-jwt'])('token %j', async (token) => {
      await falla(token);
    });

    it('el JWKS no responde (error de red) → falla, no excepción', async () => {
      const v = new AppleIdTokenVerifier(
        BUNDLE_ID,
        () => Promise.reject(new Error('ECONNRESET')),
        () => AHORA,
      );

      const r = await v.verificarIdToken(await firmar(par), NONCE_CRUDO);

      expect(r.isFail()).toBe(true);
    });

    it('el mensaje de la falla no filtra la causa ni el token', async () => {
      const token = await firmar(par, { audience: 'cl.otro.app' });

      const error = await falla(token);

      expect(error.message).toBe('No se pudo verificar la identidad externa.');
      expect(error.motivo).not.toContain(token);
    });
  });
});

describe('AppleIdTokenVerifier.verificarSubDelCanje (id_token de /auth/token, sin nonce)', () => {
  let par: Par;
  beforeAll(async () => {
    par = await crearPar('kid-canje');
  });

  it('token válido sin claim nonce → el sub', async () => {
    const token = await firmar(par, { claims: { nonce: undefined } });

    const r = await verificador(par).verificarSubDelCanje(token);

    expect(r.getValue()).toBe('apple-sub-1');
  });

  it.each([
    ['audience ajena', { audience: 'otra.app' }],
    ['issuer ajeno', { issuer: 'https://evil.example' }],
    ['expirado', { exp: Math.floor(AHORA.getTime() / 1000) - 10 }],
  ])('%s → fail', async (_n, opts) => {
    const r = await verificador(par).verificarSubDelCanje(
      await firmar(par, opts),
    );

    expect(r.isFail()).toBe(true);
  });

  it('firmado con otra clave → fail', async () => {
    const otra = await crearPar('kid-canje');
    const r = await verificador(par).verificarSubDelCanje(
      await firmar(par, { firmarCon: otra.privateKey }),
    );

    expect(r.isFail()).toBe(true);
  });

  it('basura o vacío → fail, sin lanzar', async () => {
    const v = verificador(par);

    expect((await v.verificarSubDelCanje('')).isFail()).toBe(true);
    expect((await v.verificarSubDelCanje('no.es.jwt')).isFail()).toBe(true);
  });
});
