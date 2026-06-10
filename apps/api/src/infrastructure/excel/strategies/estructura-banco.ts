import { BancoConocido } from '../../../domain/value-objects/nombre-banco';
import { ColumnaEsperada } from '../../../domain/value-objects/columna-esperada';

/**
 * Metadata estructural de un banco: en qué fila están los encabezados y qué
 * columnas se esperan. Cada strategy expone esto vía getEstructura() para que
 * el ExcelStructureValidatorService valide el archivo sin acoplarse a un banco.
 */
export interface EstructuraBanco {
  readonly banco: BancoConocido;
  readonly filaEncabezados: number;
  readonly columnas: ReadonlyArray<ColumnaEsperada>;
}
