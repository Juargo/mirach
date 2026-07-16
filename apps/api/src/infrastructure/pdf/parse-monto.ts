/**
 * parsearMontoPdf — convierte el texto de una celda de monto PDF (CLP) a un
 * entero exacto, SIN aritmética de punto flotante (ADR-015: el dinero nunca
 * es float).
 *
 * Acepta:
 *   - Prefijo "$" opcional, con o sin espacio interno ("$850.000", "$ 850.000").
 *   - Separador de miles "." (convención chilena, ej. "1.580.000").
 *   - Signo negativo opcional — se descarta y el valor vuelve positivo (misma
 *     convención que CA-08 del normalizador Excel: BancoEstado expresa
 *     cargos como negativos, se guardan en valor absoluto).
 *
 * NUNCA lanza y NUNCA propaga NaN: texto vacío o ininterpretable → 0. Esto
 * difiere a propósito de `parseMontoEntero` (Excel), que retorna `null` para
 * que el caller reporte `MontoIninterpretable` — el pipeline PDF (US-010) no
 * tiene esa taxonomía de error por fila; una celda de monto vacía o corrupta
 * simplemente no contribuye money al canónico (ver pdf-normalization.ts).
 *
 * Reutilizable por los 4 bancos (PR4a Santander, PR4b BancoEstado/Chile/BCI)
 * — la representación del monto es la misma en los fixtures reales.
 */
export function parsearMontoPdf(valor: string): number {
  const limpio = valor.trim().replace(/\$/g, '').replace(/\s/g, '');
  if (limpio === '') return 0;

  const sinSigno = limpio.replace(/^-/, '');
  const formatoValido = /^\d{1,3}(\.\d{3})*$|^\d+$/.test(sinSigno);
  if (!formatoValido) return 0;

  const sinSeparadores = sinSigno.replace(/\./g, '');
  const n = parseInt(sinSeparadores, 10);
  return Number.isFinite(n) ? n : 0;
}
