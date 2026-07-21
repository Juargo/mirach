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
  return `${input.fecha.getTime()}|${input.cargo}|${input.abono}|${input.descripcion}`;
}
