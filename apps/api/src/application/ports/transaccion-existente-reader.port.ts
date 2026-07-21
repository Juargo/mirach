import { Result } from '../../shared/result';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';

/**
 * TransaccionExistente — proyección de una transacción ya persistida, con
 * `descripcion` DESCIFRADA (plaintext). El dinero viaja como `bigint`,
 * fuente de verdad exacta del lado ya persistido (US-005).
 */
export interface TransaccionExistente {
  readonly fecha: Date;
  readonly descripcion: string; // plaintext (ya pasó por ICryptoService.decrypt)
  readonly cargo: bigint; // fuente de verdad BigInt-exacta
  readonly abono: bigint;
}

/**
 * ITransaccionExistenteReader — port de aplicación (lado de lectura), lectura
 * acotada para detección de duplicados (US-005). Un SELECT por
 * (accountId, fecha ∈ [desde, hasta]); descifra `descripcion` en la capa de
 * infraestructura y devuelve texto plano.
 *
 * El "check" (comparación de claves) NO vive aquí: este port solo lee y
 * devuelve filas existentes decodificadas — la comparación es responsabilidad
 * de `DetectarDuplicadosUseCase`, que construye las claves de ambos lados con
 * la misma función de dominio (`construirClaveDuplicado`).
 *
 * API asíncrona; retorna Result y NUNCA lanza en el contrato de aplicación
 * (la implementación Prisma convierte errores de infra en Result.fail, igual
 * que IIngestaRepository).
 */
export interface ITransaccionExistenteReader {
  buscarPorCuentaYRango(
    accountId: string,
    fechaDesde: Date,
    fechaHasta: Date,
  ): Promise<Result<ReadonlyArray<TransaccionExistente>, PersistenciaFallidaError>>;
}

/** Token de inyección — las interfaces se borran en runtime. */
export const TRANSACCION_EXISTENTE_READER = 'ITransaccionExistenteReader';
