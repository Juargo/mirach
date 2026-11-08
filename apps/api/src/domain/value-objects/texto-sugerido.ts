import { normalizarTextoPatron } from './patron-clasificacion';

/** Fewer letters than this and the text says nothing about the merchant (S1). */
export const LETRAS_MINIMAS_TEXTO_SUGERIDO = 3;

/**
 * Payment-gateway prefixes that come before the merchant name in a glosa
 * ("MERPAGO*CABIFY"). They are noise: a pattern on them would catch every
 * merchant behind the same gateway.
 */
const PREFIJOS_PASARELA = [
  'merpago*',
  'mercadopago*',
  'payu *',
  'dl*',
  'pp*',
] as const;

/**
 * sugerirTextoPatron — derives the CONTAINS text the app suggests when the
 * person reclassifies a movement (CLA-03, S1):
 *   - lowercase, without accents (`normalizarTextoPatron`, CLA-14);
 *   - without the payment-gateway prefixes at the start;
 *   - without digits, `*` and stray punctuation, with spaces collapsed.
 *
 * Example: «MERPAGO*CABIFY1234 5678» → «cabify».
 *
 * Returns `null` when fewer than `LETRAS_MINIMAS_TEXTO_SUGERIDO` letters
 * remain: there is nothing to suggest. Pure; never throws.
 */
export function sugerirTextoPatron(glosa: string): string | null {
  let texto = normalizarTextoPatron(glosa);

  let prefijo = PREFIJOS_PASARELA.find((p) => texto.startsWith(p));
  while (prefijo !== undefined) {
    texto = texto.slice(prefijo.length).trimStart();
    prefijo = PREFIJOS_PASARELA.find((p) => texto.startsWith(p));
  }

  const limpio = texto
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const letras = limpio.replace(/[^\p{L}]/gu, '').length;
  return letras < LETRAS_MINIMAS_TEXTO_SUGERIDO ? null : limpio;
}
