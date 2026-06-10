import ExcelJS from 'exceljs';
import { BancoConocido } from '../../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../../domain/value-objects/tipo-cuenta';
import { TipoColumna } from '../../../domain/value-objects/tipo-columna';
import { ColumnaEsperada } from '../../../domain/value-objects/columna-esperada';
import { DetectedBank } from '../../../application/ports/bank-detector.port';
import { EstructuraBanco } from './estructura-banco';
import { MapeoCanonico } from './mapeo-canonico';

/**
 * Patrón BCI:
 *   - A1 = "Últimos Movimientos" (sin "CuentaRUT")
 *   - A8 = "Fecha Transacción" (encabezado de tabla)
 *   - Datos desde fila 9; celdas en formato richText (se accede vía cell.text).
 */
export class BciStrategy {
  matches(ws: ExcelJS.Worksheet): boolean {
    const a1 = (ws.getCell('A1').text ?? '').trim();
    const a8 = (ws.getCell('A8').text ?? '').trim();
    return a1 === 'Últimos Movimientos' && a8 === 'Fecha Transacción';
  }

  extract(_ws: ExcelJS.Worksheet): DetectedBank {
    return {
      banco: BancoConocido.BCI,
      tipoCuenta: TipoCuentaConocido.CuentaCorriente,
      numeroCuenta: '',
    };
  }

  getEstructura(): EstructuraBanco {
    const columnas: ColumnaEsperada[] = [
      { letra: 'A', nombre: 'Fecha Transacción', tipo: TipoColumna.Fecha },
      { letra: 'B', nombre: 'Fecha Contable', tipo: TipoColumna.Fecha },
      { letra: 'C', nombre: 'Descripción', tipo: TipoColumna.Texto },
      { letra: 'G', nombre: 'Cargo $', tipo: TipoColumna.Numero },
      { letra: 'H', nombre: 'Abono $', tipo: TipoColumna.Numero },
    ];
    return { banco: BancoConocido.BCI, filaEncabezados: 8, columnas };
  }

  getMapeoCanonico(): MapeoCanonico {
    return {
      banco: BancoConocido.BCI,
      fecha: 'A',
      descripcion: 'C',
      cargo: 'G',
      abono: 'H',
      cargoNegativo: false,
    };
  }
}
