import { Result } from '../../shared/result';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';
import { DetectedBank } from './bank-detector.port';

/**
 * IAccountRepository — port de aplicación (upsert de cuenta).
 *
 * Asegura (idempotente) la existencia de la Account del usuario para el banco
 * detectado, por la clave natural (userId, banco, tipoCuenta, numeroCuenta).
 * Se invoca en tiempo de ingesta antes de persistir las transacciones.
 *
 * Retorna Result y NUNCA lanza en el contrato de aplicación; la implementación
 * Prisma convierte errores de infraestructura en Result.fail.
 */
export interface IAccountRepository {
  ensure(
    userId: string,
    banco: DetectedBank,
  ): Promise<Result<{ accountId: string }, PersistenciaFallidaError>>;
}

/** Token de inyección — las interfaces se borran en runtime. */
export const ACCOUNT_REPOSITORY = 'IAccountRepository';
