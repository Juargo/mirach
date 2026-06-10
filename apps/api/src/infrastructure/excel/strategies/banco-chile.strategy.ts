import ExcelJS from 'exceljs';
import { BancoConocido } from '../../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../../domain/value-objects/tipo-cuenta';
import { TipoColumna } from '../../../domain/value-objects/tipo-columna';
import { ColumnaEsperada } from '../../../domain/value-objects/columna-esperada';
import { DetectedBank } from '../../../application/ports/bank-detector.port';
import { EstructuraBanco } from './estructura-banco';
import { MapeoCanonico } from './mapeo-canonico';

/**
 * Patrón Banco de Chile:
 *   - B8 = "Sr(a):"
 *   - B9 = "Rut:"
 *   - B10 = "Cuenta:"
 *   - Número de cuenta en C10, formato "00-173-XXXXX-XX"
 *
 * Estructura de movimientos basada en cartolas .xlsx típicas del portal
 * (no verificada con fixture aún — pendiente descargar .xlsx).
 */
export class BancoChileStrategy {
  matches(ws: ExcelJS.Worksheet): boolean {
    const b8 = (ws.getCell('B8').text ?? '').trim();
    const b9 = (ws.getCell('B9').text ?? '').trim();
    const b10 = (ws.getCell('B10').text ?? '').trim();
    return b8 === 'Sr(a):' && b9 === 'Rut:' && b10 === 'Cuenta:';
  }

  extract(ws: ExcelJS.Worksheet): DetectedBank {
    const numeroCuenta = (ws.getCell('C10').text ?? '').trim();
    return {
      banco: BancoConocido.BancoChile,
      tipoCuenta: TipoCuentaConocido.CuentaCorriente,
      numeroCuenta,
    };
  }

  getEstructura(): EstructuraBanco {
    const columnas: ColumnaEsperada[] = [
      { letra: 'A', nombre: 'Fecha', tipo: TipoColumna.Fecha },
      { letra: 'B', nombre: 'Descripción', tipo: TipoColumna.Texto },
      { letra: 'C', nombre: 'N° Documento', tipo: TipoColumna.Numero },
      { letra: 'D', nombre: 'Cargos ($)', tipo: TipoColumna.Numero },
      { letra: 'E', nombre: 'Abonos ($)', tipo: TipoColumna.Numero },
      { letra: 'F', nombre: 'Saldo ($)', tipo: TipoColumna.Numero },
    ];
    return { banco: BancoConocido.BancoChile, filaEncabezados: 12, columnas };
  }

  getMapeoCanonico(): MapeoCanonico {
    return {
      banco: BancoConocido.BancoChile,
      fecha: 'A',
      descripcion: 'B',
      cargo: 'D',
      abono: 'E',
      cargoNegativo: false,
    };
  }
}
