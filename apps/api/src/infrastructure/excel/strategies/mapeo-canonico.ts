import { BancoConocido } from '../../../domain/value-objects/nombre-banco';

/**
 * Mapeo de columnas del archivo bancario al esquema canónico (US-007).
 *
 *   fecha, descripcion, cargo, abono → letra de columna en el archivo original.
 *   cargoNegativo → true cuando el banco expresa cargos como valores negativos
 *                   (BancoEstado). El normalizador aplicará abs() en ese caso.
 */
export interface MapeoCanonico {
  readonly banco: BancoConocido;
  readonly fecha: string;
  readonly descripcion: string;
  readonly cargo: string;
  readonly abono: string;
  readonly cargoNegativo: boolean;
}
