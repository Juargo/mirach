import ExcelJS from 'exceljs';
import { BancoConocido } from '../../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../../domain/value-objects/tipo-cuenta';
import { TipoColumna } from '../../../domain/value-objects/tipo-columna';
import { ColumnaEsperada } from '../../../domain/value-objects/columna-esperada';
import { DetectedBank } from '../../../application/ports/bank-detector.port';
import { EstructuraBanco } from './estructura-banco';
import { MapeoCanonico } from './mapeo-canonico';

/**
 * Patrón BancoEstado (CuentaRUT):
 *   - A1 contiene "CuentaRUT"
 *   - Número de cuenta embebido: "Últimos Movimientos CuentaRUT N° 00017046102"
 *   - Encabezados de movimientos en fila 14, datos desde fila 15.
 */
export class BancoEstadoStrategy {
  matches(ws: ExcelJS.Worksheet): boolean {
    const a1 = ws.getCell('A1').text ?? '';
    return a1.includes('CuentaRUT');
  }

  extract(ws: ExcelJS.Worksheet): DetectedBank {
    const a1 = ws.getCell('A1').text ?? '';
    const match = a1.match(/N[°o]\s*(\d+)/i);
    const numeroCuenta = match ? match[1] : '';
    return {
      banco: BancoConocido.BancoEstado,
      tipoCuenta: TipoCuentaConocido.CuentaRut,
      numeroCuenta,
    };
  }

  getEstructura(): EstructuraBanco {
    const columnas: ColumnaEsperada[] = [
      { letra: 'A', nombre: 'Fecha', tipo: TipoColumna.Fecha },
      { letra: 'B', nombre: 'N° Operación', tipo: TipoColumna.Numero },
      { letra: 'C', nombre: 'Descripción', tipo: TipoColumna.Texto },
      { letra: 'D', nombre: 'Cheques / Cargos $', tipo: TipoColumna.Numero },
      { letra: 'E', nombre: 'Depósitos / Abonos $', tipo: TipoColumna.Numero },
      { letra: 'F', nombre: 'Saldo $', tipo: TipoColumna.Numero },
    ];
    return { banco: BancoConocido.BancoEstado, filaEncabezados: 14, columnas };
  }

  getMapeoCanonico(): MapeoCanonico {
    return {
      banco: BancoConocido.BancoEstado,
      fecha: 'A',
      descripcion: 'C',
      cargo: 'D',
      abono: 'E',
      cargoNegativo: true,
    };
  }
}
