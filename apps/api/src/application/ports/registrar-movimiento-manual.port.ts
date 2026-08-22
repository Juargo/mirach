import { Result } from '../../shared/result';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';
import { Bucket } from '../../domain/value-objects/bucket';
import { Transaccion } from '../../domain/value-objects/transaccion';

/**
 * RegistrarMovimientoManualInput — datos necesarios para persistir un
 * movimiento manual (US-058, D-04). Lleva la Transaccion VO ya construida
 * y validada, más el bucket y categoriaId resueltos en el use case.
 *
 * Siempre tiene bucket (Ingreso o un bucket de Gasto elegido) — nunca null,
 * porque un movimiento manual tiene origen conocido por construcción.
 */
export interface RegistrarMovimientoManualInput {
  readonly userId: string;
  readonly accountId: string;
  readonly transaccion: Transaccion;
  readonly bucket: Bucket;
  readonly categoriaId: string | null;
}

/**
 * IRegistrarMovimientoManualWriter — port de escritura estrecho (D-04, ISP).
 *
 * Dos métodos en UN único port porque ambos forman la responsabilidad
 * atómica de "registrar un movimiento manual":
 *
 * 1. `asegurarCuentaManual(userId)` — find-or-create idempotente del Account
 *    centinela `(banco='Manual', tipoCuenta='Manual')` para el usuario.
 *    NUNCA llama a `IAccountRepository.ensure` — el sentinel no encaja en
 *    DetectedBank/BancoConocido (D-05).
 *
 * 2. `registrar(input)` — escritura de la Transaccion con ingestaId=null y
 *    origen='Manual'. Sin escritura de Ingesta (D-09: nunca historial manual).
 *
 * Ambos métodos retornan Result — NUNCA lanzan (ADR-005).
 */
export interface IRegistrarMovimientoManualWriter {
  asegurarCuentaManual(
    userId: string,
  ): Promise<Result<{ accountId: string }, PersistenciaFallidaError>>;

  registrar(
    input: RegistrarMovimientoManualInput,
  ): Promise<Result<{ id: string }, PersistenciaFallidaError>>;
}
