import { generateKeyPairSync } from 'node:crypto';

import { crearClienteAppleAuth } from './crear-cliente-apple-auth';
import { AppleAuthHttpClient } from '../infrastructure/identity/apple-auth-http.client';
import { FakeLogger } from '../../test/support/logger.double';

const pem = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
}).privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

const COMPLETO = {
  APPLE_BUNDLE_ID: 'app.mirachbudget.ios',
  APPLE_TEAM_ID: 'TEAM123456',
  APPLE_KEY_ID: 'KEY1234567',
  APPLE_PRIVATE_KEY: pem,
};

describe('crearClienteAppleAuth', () => {
  it('con las cuatro variables arma el cliente y avisa (info) que quedó habilitado', () => {
    const logger = new FakeLogger();

    expect(crearClienteAppleAuth(COMPLETO, logger)).toBeInstanceOf(
      AppleAuthHttpClient,
    );
    expect(logger.calls.map((c) => c.level)).toEqual(['info']);
  });

  it('con el PEM en una línea con \\n literales también arma el cliente', () => {
    const logger = new FakeLogger();
    const cliente = crearClienteAppleAuth(
      { ...COMPLETO, APPLE_PRIVATE_KEY: pem.trim().replace(/\n/g, '\\n') },
      logger,
    );

    expect(cliente).toBeInstanceOf(AppleAuthHttpClient);
  });

  it('login con Apple apagado y sin credenciales → undefined y en silencio', () => {
    const logger = new FakeLogger();

    expect(crearClienteAppleAuth({}, logger)).toBeUndefined();
    expect(logger.calls).toEqual([]);
  });

  it('bundle presente pero sin credenciales REST → undefined con UN info', () => {
    const logger = new FakeLogger();

    const cliente = crearClienteAppleAuth(
      { APPLE_BUNDLE_ID: 'app.mirachbudget.ios' },
      logger,
    );

    expect(cliente).toBeUndefined();
    expect(logger.calls.map((c) => c.level)).toEqual(['info']);
  });

  it('config a medias → undefined con UN warn que nombra lo que falta (sin valores)', () => {
    const logger = new FakeLogger();

    const cliente = crearClienteAppleAuth(
      { ...COMPLETO, APPLE_KEY_ID: undefined, APPLE_PRIVATE_KEY: '   ' },
      logger,
    );

    expect(cliente).toBeUndefined();
    expect(logger.calls).toHaveLength(1);
    expect(logger.calls[0].level).toBe('warn');
    expect(logger.calls[0].context).toEqual({
      faltantes: ['APPLE_KEY_ID', 'APPLE_PRIVATE_KEY'],
    });
  });

  it('PEM inválido → undefined con UN warn que no filtra el valor', () => {
    const logger = new FakeLogger();

    const cliente = crearClienteAppleAuth(
      { ...COMPLETO, APPLE_PRIVATE_KEY: 'basura-SECRETA' },
      logger,
    );

    expect(cliente).toBeUndefined();
    expect(logger.calls.map((c) => c.level)).toEqual(['warn']);
    expect(JSON.stringify(logger.calls)).not.toContain('SECRETA');
  });
});
