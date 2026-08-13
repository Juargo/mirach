import {
  firmarLinkIntent,
  verificarLinkIntent,
  type LinkIntent,
} from './link-intent';

/**
 * link-intent — unit tests (US-041, binding item #1/#2).
 *
 * Cubre: determinismo, sensibilidad a cada input firmado, la prueba de
 * canonicalización (design §1/Q1b — la razón para el length-prefix), y los
 * dos traps de verificación (design §1/Q1c): `timingSafeEqual` lanza en
 * largos distintos, `Buffer.from(x, 'base64url')` NO lanza con basura —
 * trunca en silencio.
 */
describe('firmarLinkIntent / verificarLinkIntent', () => {
  const key = Buffer.alloc(32, 9);
  const state = 'state-abc';
  const userId = 'user-123';

  it('es determinístico: misma key+state+userId ⇒ mismo mac', () => {
    const a = firmarLinkIntent(key, state, userId);
    const b = firmarLinkIntent(key, state, userId);

    expect(a.mac).toBe(b.mac);
    expect(a.userId).toBe(userId);
  });

  it('un state distinto produce un mac distinto', () => {
    const a = firmarLinkIntent(key, state, userId);
    const b = firmarLinkIntent(key, 'otro-state', userId);

    expect(a.mac).not.toBe(b.mac);
  });

  it('un userId distinto produce un mac distinto', () => {
    const a = firmarLinkIntent(key, state, userId);
    const b = firmarLinkIntent(key, state, 'otro-user');

    expect(a.mac).not.toBe(b.mac);
  });

  it('una key distinta produce un mac distinto', () => {
    const otraKey = Buffer.alloc(32, 1);
    const a = firmarLinkIntent(key, state, userId);
    const b = firmarLinkIntent(otraKey, state, userId);

    expect(a.mac).not.toBe(b.mac);
  });

  it('CANONICALIZACIÓN (design §1/Q1b): firmar(k,"a.b","c") !== firmar(k,"a","b.c") — el length-prefix hace la codificación inyectiva', () => {
    const a = firmarLinkIntent(key, 'a.b', 'c');
    const b = firmarLinkIntent(key, 'a', 'b.c');

    expect(a.mac).not.toBe(b.mac);
  });

  it('verificarLinkIntent acepta un intent recién firmado con la misma key+state', () => {
    const intent = firmarLinkIntent(key, state, userId);

    expect(verificarLinkIntent(key, state, intent)).toBe(true);
  });

  it('verificarLinkIntent rechaza (false, nunca throw) un mac de largo incorrecto — trap #1: timingSafeEqual lanza en largos distintos', () => {
    const intent: LinkIntent = { userId, mac: 'ab' };

    expect(() => verificarLinkIntent(key, state, intent)).not.toThrow();
    expect(verificarLinkIntent(key, state, intent)).toBe(false);
  });

  it('verificarLinkIntent rechaza (false) un mac vacío', () => {
    const intent: LinkIntent = { userId, mac: '' };

    expect(verificarLinkIntent(key, state, intent)).toBe(false);
  });

  it('verificarLinkIntent rechaza (false, nunca throw) basura no-base64url — trap #2: Buffer.from(x, base64url) NO lanza, trunca en silencio', () => {
    const intent: LinkIntent = { userId, mac: '!!!not-base64url!!!' };

    expect(() => verificarLinkIntent(key, state, intent)).not.toThrow();
    expect(verificarLinkIntent(key, state, intent)).toBe(false);
  });

  it('verificarLinkIntent rechaza un mac firmado sobre un state distinto', () => {
    const intent = firmarLinkIntent(key, 'otro-state', userId);

    expect(verificarLinkIntent(key, state, intent)).toBe(false);
  });

  it('verificarLinkIntent rechaza un mac firmado para otro userId, presentado con un userId distinto (el mac no matchea el mensaje recompuesto)', () => {
    const macDeOtroUser = firmarLinkIntent(key, state, 'otro-user').mac;
    const intentFalsificado: LinkIntent = { userId, mac: macDeOtroUser };

    expect(verificarLinkIntent(key, state, intentFalsificado)).toBe(false);
  });

  it('verificarLinkIntent rechaza un mac firmado con otra key', () => {
    const otraKey = Buffer.alloc(32, 1);
    const intent = firmarLinkIntent(otraKey, state, userId);

    expect(verificarLinkIntent(key, state, intent)).toBe(false);
  });
});
