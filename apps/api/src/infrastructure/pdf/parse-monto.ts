/**
 * parsearMontoPdf — convierte el texto de una celda de monto PDF (CLP) a un
 * entero exacto, SIN aritmética de punto flotante (ADR-015: el dinero nunca
 * es float).
 *
 * Acepta:
 *   - Prefijo "$" opcional, con o sin espacio interno ("$850.000", "$ 850.000").
 *   - Separador de miles "." (convención chilena, ej. "1.580.000").
 *   - Signo negativo AL INICIO — se descarta y el valor vuelve positivo (misma
 *     convención que CA-08 del normalizador Excel: BancoEstado expresa
 *     cargos como negativos, se guardan en valor absoluto).
 *
 * Retorna `null` cuando el texto es ININTERPRETABLE (coma decimal
 * "1.500,50", signo al FINAL "15.000-", grupos que no son de 3 dígitos
 * "12.34", texto no numérico) O cuando está vacío/solo espacios — mismo
 * contrato que `parseMontoEntero` (normalizador Excel), que también retorna
 * `null` para que el CALLER decida qué hacer con cada caso:
 *
 *   - Columna vacía (ninguna celda de monto en esa columna de esa fila) → el
 *     caller NUNCA llama a esta función con texto vacío (chequea `!== ''`
 *     antes, ver pdf-normalization.ts) y usa 0 directamente — una columna
 *     vacía NO es un error, es la convención "sin cargo"/"sin abono" en esa
 *     fila (CA-06 del normalizador Excel, misma semántica acá).
 *   - Texto NO vacío que retorna `null` → MALFORMADO. El caller NUNCA debe
 *     tratar esto como 0 en silencio (ADR-015: perder un monto real porque
 *     no calzó el formato esperado corrompería el total consolidado sin
 *     ninguna señal) — debe reportarlo como problema (`ProblemaEstructuraPdf`
 *     tipo `MontoIleeible`, ver pdf-normalization.ts).
 *
 * Este contrato es un cambio DELIBERADO respecto a la primera versión (PR4a),
 * que retornaba 0 tanto para vacío como para malformado sin distinguir
 * ambos casos — distinguirlos es el hardening de PR4b (deferred de PR4a).
 *
 * NUNCA lanza y NUNCA propaga NaN.
 */
export function parsearMontoPdf(valor: string): number | null {
  const limpio = valor.trim().replace(/\$/g, '').replace(/\s/g, '');
  if (limpio === '') return null;

  const sinSigno = limpio.replace(/^-/, '');
  const formatoValido = /^\d{1,3}(\.\d{3})*$|^\d+$/.test(sinSigno);
  if (!formatoValido) return null;

  const sinSeparadores = sinSigno.replace(/\./g, '');
  const n = parseInt(sinSeparadores, 10);
  return Number.isFinite(n) ? n : null;
}
