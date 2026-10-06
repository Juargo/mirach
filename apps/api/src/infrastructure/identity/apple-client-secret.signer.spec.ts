import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import { decodeProtectedHeader, jwtVerify } from 'jose';

import {
  AppleClientSecretSigner,
  CLIENT_SECRET_LIFETIME_SECONDS,
  CLIENT_SECRET_REFRESH_MARGIN_SECONDS,
  normalizarPemApple,
} from './apple-client-secret.signer';

// Unit — la clave es una EC P-256 descartable generada en el test.

const { privateKey, publicKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
});
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

const CONFIG = {
  teamId: 'TEAM123456',
  keyId: 'KEY1234567',
  clientId: 'app.mirachbudget.ios',
  privateKeyPem: pem,
};

function makeSigner(reloj: { now: Date }) {
  return new AppleClientSecretSigner(CONFIG, () => reloj.now);
}

async function verificar(jwt: string, key: KeyObject = publicKey) {
  return jwtVerify(jwt, key, {
    issuer: CONFIG.teamId,
    audience: 'https://appleid.apple.com',
    subject: CONFIG.clientId,
    algorithms: ['ES256'],
    currentDate: new Date('2026-10-06T12:00:00.000Z'),
  });
}

describe('AppleClientSecretSigner', () => {
  const t0 = new Date('2026-10-06T12:00:00.000Z');

  it('firma un JWT ES256 con kid, iss/sub/aud/iat/exp que Apple espera', async () => {
    const jwt = await makeSigner({ now: t0 }).obtener();

    expect(decodeProtectedHeader(jwt)).toEqual({
      alg: 'ES256',
      kid: CONFIG.keyId,
    });
    const { payload } = await verificar(jwt);
    expect(payload.iss).toBe(CONFIG.teamId);
    expect(payload.sub).toBe(CONFIG.clientId);
    expect(payload.aud).toBe('https://appleid.apple.com');
    expect(payload.iat).toBe(Math.floor(t0.getTime() / 1000));
    expect(payload.exp).toBe(
      Math.floor(t0.getTime() / 1000) + CLIENT_SECRET_LIFETIME_SECONDS,
    );
  });

  it('la vida del secreto queda muy por debajo del tope de 6 meses de Apple', () => {
    expect(CLIENT_SECRET_LIFETIME_SECONDS).toBeLessThanOrEqual(180 * 24 * 3600);
  });

  it('la firma NO verifica con otra clave', async () => {
    const jwt = await makeSigner({ now: t0 }).obtener();
    const otra = generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey;

    await expect(verificar(jwt, otra)).rejects.toThrow();
  });

  it('cachea el secreto mientras no llegue al margen de refresco', async () => {
    const reloj = { now: t0 };
    const signer = makeSigner(reloj);

    const a = await signer.obtener();
    reloj.now = new Date(
      t0.getTime() +
        (CLIENT_SECRET_LIFETIME_SECONDS -
          CLIENT_SECRET_REFRESH_MARGIN_SECONDS -
          1) *
          1000,
    );
    const b = await signer.obtener();

    expect(b).toBe(a);
  });

  it('firma uno nuevo al entrar al margen previo a la expiración', async () => {
    const reloj = { now: t0 };
    const signer = makeSigner(reloj);

    const a = await signer.obtener();
    reloj.now = new Date(
      t0.getTime() +
        (CLIENT_SECRET_LIFETIME_SECONDS -
          CLIENT_SECRET_REFRESH_MARGIN_SECONDS) *
          1000,
    );
    const b = await signer.obtener();

    expect(b).not.toBe(a);
    const { payload } = await jwtVerify(b, publicKey, {
      currentDate: reloj.now,
    });
    expect(payload.iat).toBe(Math.floor(reloj.now.getTime() / 1000));
  });

  it('acepta el PEM con "\\n" literales (como se pega en un dashboard de env)', async () => {
    const enUnaLinea = pem.trim().replace(/\n/g, '\\n');
    const signer = new AppleClientSecretSigner(
      { ...CONFIG, privateKeyPem: enUnaLinea },
      () => t0,
    );

    await expect(verificar(await signer.obtener())).resolves.toBeDefined();
  });

  it('falla en la construcción si la clave no es un PEM EC válido (sin filtrarla)', () => {
    const secreto = 'no-es-un-pem-SECRETO-XYZ';
    let mensaje = '';
    try {
      new AppleClientSecretSigner(
        { ...CONFIG, privateKeyPem: secreto },
        () => t0,
      );
    } catch (e) {
      mensaje = (e as Error).message;
    }

    expect(mensaje).not.toBe('');
    expect(mensaje).not.toContain(secreto);
  });
});

describe('normalizarPemApple', () => {
  it('convierte \\n literales y recorta espacios', () => {
    expect(normalizarPemApple('  a\\nb\\n ')).toBe('a\nb');
  });

  it('deja intacto un PEM multilínea real', () => {
    expect(normalizarPemApple('a\nb')).toBe('a\nb');
  });
});
