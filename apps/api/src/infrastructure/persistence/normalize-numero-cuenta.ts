/**
 * normalizeNumeroCuenta — normalización ÚNICA (US-035 Slice 2) aplicada
 * SIEMPRE antes de computar el blind index de `Account.numeroCuenta`:
 * `.trim()` solamente — a diferencia del email (Slice 1), `numeroCuenta` NO
 * se lowercasea, porque los números de cuenta que emiten los bancos chilenos
 * son case-sensitive tal cual vienen en la cartola.
 *
 * DEBE aplicarse IDÉNTICAMENTE en cada sitio que computa el blind index
 * (`PrismaAccountRepository.ensure`, `PrismaDemoRepository.crear`,
 * `prisma/seed.ts`, `prisma/backfill-numero-cuenta-blind-index.ts`) — si
 * alguno normaliza distinto, el índice que escribe uno no matchea el que
 * consulta otro (upsert de ingesta roto en silencio). Single-sourced a
 * propósito (DRY, ver skill `dry`).
 */
export function normalizeNumeroCuenta(numeroCuenta: string): string {
  return numeroCuenta.trim();
}
