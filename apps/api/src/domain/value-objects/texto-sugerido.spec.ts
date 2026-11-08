import { sugerirTextoPatron } from './texto-sugerido';

describe('sugerirTextoPatron (CLA-03, S1)', () => {
  it('the documented example: «MERPAGO*CABIFY1234 5678» → «cabify»', () => {
    expect(sugerirTextoPatron('MERPAGO*CABIFY1234 5678')).toBe('cabify');
  });

  it('lowercases and removes accents', () => {
    expect(sugerirTextoPatron('CAFÉ ÑUÑOA')).toBe('cafe nunoa');
  });

  it.each([
    ['MERCADOPAGO*JUMBO', 'jumbo'],
    ['PAYU *NETFLIX', 'netflix'],
    ['DL*GOOGLE YOUTUBE', 'google youtube'],
    ['PP*SPOTIFY', 'spotify'],
  ])('removes the payment-gateway prefix of %s', (glosa, esperado) => {
    expect(sugerirTextoPatron(glosa)).toBe(esperado);
  });

  it('keeps a gateway word that is not a prefix', () => {
    expect(sugerirTextoPatron('COMPRA PP*SPOTIFY')).toBe('compra pp spotify');
  });

  it('removes digits, asterisks and stray punctuation, then collapses spaces', () => {
    expect(sugerirTextoPatron('  UBER *TRIP 12-34, HELP.UBER.COM ')).toBe(
      'uber trip help uber com',
    );
  });

  it('returns null when fewer than 3 letters remain', () => {
    expect(sugerirTextoPatron('MERPAGO*AB 1234')).toBeNull();
    expect(sugerirTextoPatron('12345 ***')).toBeNull();
    expect(sugerirTextoPatron('')).toBeNull();
  });

  it('accepts exactly 3 letters', () => {
    expect(sugerirTextoPatron('H&M 123 X')).toBe('h m x');
  });
});
