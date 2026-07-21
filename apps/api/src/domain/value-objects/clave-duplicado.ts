/**
 * ClaveDuplicadoInput — datos mínimos para construir la clave natural de
 * duplicado (US-005). `cargo`/`abono` viajan como string decimal entero
 * canónico (BigInt-exacto) para unificar el lado entrante (`number`) y el
 * lado ya persistido (`bigint`) sin conversión number↔bigint.
 */
export interface ClaveDuplicadoInput {
  readonly fecha: Date;
  readonly descripcion: string;
  /** Monto entero canónico como string decimal (BigInt-exacto). */
  readonly cargo: string;
  readonly abono: string;
}

/**
 * normalizarMontoCanonico — guarda defensiva (hardening note 1, PR1 review).
 *
 * Los dos call-sites reales de `construirClaveDuplicado` (`String(number)` del
 * lado entrante, `bigint.toString()` del lado existente) YA producen strings
 * canónicos ("5000", nunca "5,000" ni "05000"). Esta normalización es una
 * guarda contra un futuro call-site incorrecto: sin ella, un monto malformado
 * (separador de miles, ceros a la izquierda, espacios) produciría una clave
 * DISTINTA a la canónica y un duplicado real dejaría de detectarse (falso
 * negativo silencioso). Recorta espacios, descarta separadores de miles y
 * cualquier carácter no numérico, y elimina ceros a la izquierda redundantes
 * (conserva un único "0" para el monto cero). Nunca lanza: un string sin
 * dígitos válidos colapsa a "0" en vez de mistear la clave con basura.
 */
function normalizarMontoCanonico(valor: string): string {
  const soloDigitos = valor.replace(/[^\d]/g, '');
  const sinCerosIzquierda = soloDigitos.replace(/^0+(?=\d)/, '');
  return sinCerosIzquierda.length > 0 ? sinCerosIzquierda : '0';
}

/**
 * construirClaveDuplicado — clave natural de duplicado (Opción A, US-005):
 * accountId + fecha + descripcion + cargo + abono. `accountId` NO entra
 * aquí porque el scope ya está acotado por cuenta en la consulta que trae
 * las transacciones existentes: todas las claves comparadas pertenecen al
 * mismo accountId, así que incluirlo sería redundante.
 *
 * Los 3 campos numéricos van primero (nunca contienen el delimitador `|`);
 * `descripcion` va al FINAL, así su contenido —aunque incluya `|`— nunca
 * corre el límite de un campo previo (sin colisiones falsas por delimitador).
 *
 * El dinero se compara como string entero canónico, exacto, NUNCA float:
 * `String(1500) === (1500n).toString() === "1500"`.
 *
 * Función pura: sin imports de Prisma/NestJS/Result, nunca lanza.
 */
export function construirClaveDuplicado(input: ClaveDuplicadoInput): string {
  const cargo = normalizarMontoCanonico(input.cargo);
  const abono = normalizarMontoCanonico(input.abono);
  return `${input.fecha.getTime()}|${cargo}|${abono}|${input.descripcion}`;
}
