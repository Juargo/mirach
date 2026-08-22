import { Result } from '../../shared/result';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';
import { DetectedBank } from './bank-detector.port';

/**
 * IAccountReader — port de aplicación (solo lectura, US-057).
 *
 * Busca la Account de un usuario para el banco detectado (la clave natural
 * es `userId_banco_tipoCuenta_numeroCuentaBlindIndex`). Retorna `null` cuando
 * la cuenta aún no existe (el usuario nunca importó desde este banco/cuenta).
 *
 * Sibling de solo-lectura de `IAccountRepository` — deliberadamente separado
 * para que `PreviewIngestaUseCase` NO pueda invocar `ensure()` (ISP, D-05).
 * Un consumer que solo necesita leer no debe depender de la escritura.
 *
 * La implementación Prisma (`PrismaAccountReader`) hace un `findUnique` usando
 * el MISMO blind index que `PrismaAccountRepository.ensure()` — la derivación
 * de `normalizeNumeroCuenta + blindIndex.compute` debe ser verbatim idéntica
 * para que los índices coincidan (D-05).
 *
 * Retorna Result y NUNCA lanza en el contrato de aplicación.
 */
export interface IAccountReader {
  findByBanco(
    userId: string,
    banco: DetectedBank,
  ): Promise<Result<{ accountId: string } | null, PersistenciaFallidaError>>;
}

/** Token de inyección — las interfaces se borran en runtime. */
export const ACCOUNT_READER = 'IAccountReader';
