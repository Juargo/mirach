import ExcelJS from 'exceljs';
import { BancoConocido } from '../../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../../domain/value-objects/tipo-cuenta';
import { TipoColumna } from '../../../domain/value-objects/tipo-columna';
import { ColumnaEsperada } from '../../../domain/value-objects/columna-esperada';
import { DetectedBank } from '../../../application/ports/bank-detector.port';
import { EstructuraBanco } from './estructura-banco';
import { MapeoCanonico } from './mapeo-canonico';

/**
 * Patrón Santander:
 *   - A2 comienza con "Cuenta Corriente:" y contiene "0-000-"
 *   - Número de cuenta embebido: "Cuenta Corriente: 0-000-83-03862-4"
 *   - Encabezados de movimientos en fila 3, datos desde fila 4.
 *   - Fechas en formato DD-MM-YYYY.
 */
export class SantanderStrategy {
  matches(ws: ExcelJS.Worksheet): boolean {
    const a2 = (ws.getCell('A2').text ?? '').trim();
    return a2.startsWith('Cuenta Corriente:') && a2.includes('0-000-');
  }

  extract(ws: ExcelJS.Worksheet): DetectedBank {
    const a2 = (ws.getCell('A2').text ?? '').trim();
    const match = a2.match(/Cuenta Corriente:\s*(.+)/i);
    const numeroCuenta = match ? match[1].trim() : '';
    return {
      banco: BancoConocido.Santander,
      tipoCuenta: TipoCuentaConocido.CuentaCorriente,
      numeroCuenta,
    };
  }

  getEstructura(): EstructuraBanco {
    const columnas: ColumnaEsperada[] = [
      { letra: 'A', nombre: 'Fecha', tipo: TipoColumna.Fecha },
      { letra: 'B', nombre: 'Detalle', tipo: TipoColumna.Texto },
      { letra: 'C', nombre: 'Monto cargo ($)', tipo: TipoColumna.Numero },
      { letra: 'D', nombre: 'Monto abono ($)', tipo: TipoColumna.Numero },
      { letra: 'E', nombre: 'Saldo ($)', tipo: TipoColumna.Numero },
    ];
    return { banco: BancoConocido.Santander, filaEncabezados: 3, columnas };
  }

  getMapeoCanonico(): MapeoCanonico {
    return {
      banco: BancoConocido.Santander,
      fecha: 'A',
      descripcion: 'B',
      cargo: 'C',
      abono: 'D',
      cargoNegativo: false,
    };
  }
}
