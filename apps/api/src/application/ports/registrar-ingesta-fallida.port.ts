import { Result } from '../../shared/result';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';

/**
 * RegistrarIngestaFallidaInput — datos mínimos que el boundary
 * (ProcessIngestaUseCase.execute) tiene confiablemente disponibles en
 * CUALQUIER punto de falla del pipeline (design.md §3.3): `banco`/`accountId`
 * NO viajan acá a propósito — son locales a `runPipeline` y threadearlos por
 * los ~8 return sites es exactamente la plomería per-branch que el diseño
 * evita (KISS/YAGNI). Ver design.md §3.3/D2 para el tradeoff documentado.
 */
export interface RegistrarIngestaFallidaInput {
  readonly userId: string;
  readonly nombreArchivo: string;
  readonly motivo: string;
}

/**
 * IRegistrarIngestaFallidaWriter — port de aplicación (US-004, ING-07).
 *
 * Narrow port (SOLID ISP/SRP, design.md §6.2/D3): el registro de fallos y la
 * agregación de éxito tienen razones de cambio distintas, así que este NO se
 * bolt-onea a `IIngestaRepository`. Es el ÚNICO escritor de filas FALLIDA
 * (single-writer-per-state, design.md §3.1/D1) — `ProcessIngestaUseCase` lo
 * invoca desde un boundary estructuralmente never-throw (§3.2).
 *
 * `Result<T,E>` — NUNCA lanza en el contrato de aplicación.
 */
export interface IRegistrarIngestaFallidaWriter {
  registrar(
    input: RegistrarIngestaFallidaInput,
  ): Promise<Result<void, PersistenciaFallidaError>>;
}

/** Token de inyección — las interfaces se borran en runtime. */
export const REGISTRAR_INGESTA_FALLIDA_WRITER =
  'IRegistrarIngestaFallidaWriter';
