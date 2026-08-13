/**
 * VinculoRequierePasswordError — error de dominio.
 *
 * Retornado por `DesvincularGoogleUseCase` cuando la cuenta que intenta
 * desvincular no tiene `passwordHash` (usuario solo-Google). El invariante
 * "una cuenta nunca queda sin método de acceso" (CA-03, ADR-034 amendment)
 * vive en el `WHERE` de la escritura condicional
 * (`prisma-identidad-google.repository.ts#desvincularGoogleSub`); este
 * error solo produce el MENSAJE que ve el usuario — la lectura que lo
 * genera es una comprobación previa, no la fuente de verdad del invariante.
 * Mensaje fijo, sin ningún input interpolado.
 */
export class VinculoRequierePasswordError extends Error {
  constructor() {
    super('configurá una contraseña antes de desvincular Google');
    this.name = 'VinculoRequierePasswordError';
  }
}
