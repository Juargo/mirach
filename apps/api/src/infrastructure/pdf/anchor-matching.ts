import { PagedToken, PagedTokens } from './pdf-text-extractor';

/**
 * anchor-matching — coincidencia de anclas de encabezado sobre tokens PDF.
 *
 * Dos funciones puras, ambas CASE-SENSITIVE a propósito (no es un
 * descuido): las anclas de encabezado ("CARTOLA CUENTARUT N°", "Estado de
 * Cuenta", "BANCO SANTANDER CHILE"...) están escritas tal como aparecen en
 * el documento real, con su capitalización real de encabezado/título. Se
 * verificó contra los 4 fixtures reales que comparar sin distinguir
 * mayúsculas produce falsos positivos genuinos entre bancos — no
 * hipotéticos:
 *   - BCI trae un texto legal decorativo con letras espaciadas
 *     ("E S T A D O   D E   C U E N T A   L I N E A   D E   S O B R E G I R O")
 *     que, en mayúsculas, contiene "ESTADO DE CUENTA" — coincide con el
 *     ancla de Banco de Chile si se compara sin distinguir mayúsculas.
 *   - Santander trae la frase de nota al pie "... aprobado este estado de
 *     cuenta si dentro de 30 dias ..." — texto normal en minúsculas que
 *     también contiene "estado de cuenta" sin distinguir mayúsculas.
 * El encabezado real de Banco de Chile es exactamente "Estado de Cuenta"
 * (Title Case) — ninguna de las dos coincidencias espurias comparte esa
 * capitalización exacta. Comparar respetando mayúsculas/minúsculas es lo
 * que las distingue, sin necesitar heurísticas de posición/distancia.
 */

/** Quita TODO whitespace (espacios, tabs, saltos de línea) — no cambia mayúsculas/minúsculas. */
function quitarEspacios(texto: string): string {
  return texto.replace(/\s+/g, '');
}

/**
 * coincideAnclaEnToken — true si ALGÚN token individual (tras quitar su
 * whitespace interno) contiene el ancla como substring, case-sensitive.
 *
 * Uso: anclas que el PDF renderiza como UN solo token de texto (el caso
 * normal — la mayoría de los encabezados de estos 4 bancos). No junta
 * texto de tokens distintos, así que dos anclas verdaderas que están en
 * partes no relacionadas de la página nunca se combinan por accidente.
 */
export function coincideAnclaEnToken(
  tokens: PagedTokens,
  ancla: string,
): boolean {
  const anclaNormalizada = quitarEspacios(ancla);
  return tokens.some((token: PagedToken) =>
    quitarEspacios(token.str).includes(anclaNormalizada),
  );
}

/**
 * coincideAnclaEnVentana — true si el ancla aparece dentro de una ventana
 * de `ventana` tokens consecutivos (unidos con espacio y sin whitespace
 * interno), case-sensitive.
 *
 * Uso: SOLO para anclas que el PDF fragmenta en varios tokens adyacentes
 * por letter-spacing decorativo (ej: el nombre "BANCO SANTANDER CHILE" de
 * Santander llega como 3 tokens: "B A N C O", "S A N T A N D E R",
 * "C H I L E"). `coincideAnclaEnToken` nunca la encontraría porque ningún
 * token individual contiene la frase completa.
 */
export function coincideAnclaEnVentana(
  tokens: PagedTokens,
  ancla: string,
  ventana = 8,
): boolean {
  const anclaNormalizada = quitarEspacios(ancla);
  for (let i = 0; i < tokens.length; i++) {
    const textoVentana = tokens
      .slice(i, i + ventana)
      .map((t) => t.str)
      .join(' ');
    if (quitarEspacios(textoVentana).includes(anclaNormalizada)) {
      return true;
    }
  }
  return false;
}
