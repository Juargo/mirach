import ExcelJS from 'exceljs';
import { Result } from '../../shared/result';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { Transaccion } from '../../domain/value-objects/transaccion';
import {
  NormalizacionInvalidaError,
  ProblemaNormalizacion,
} from '../../domain/errors/normalizacion-invalida.error';
import { ITransactionNormalizer } from '../../application/ports/transaction-normalizer.port';
import { BancoChileStrategy } from './strategies/banco-chile.strategy';
import { BancoEstadoStrategy } from './strategies/banco-estado.strategy';
import { BciStrategy } from './strategies/bci.strategy';
import { SantanderStrategy } from './strategies/santander.strategy';
import { MapeoCanonico } from './strategies/mapeo-canonico';
import { EstructuraBanco } from './strategies/estructura-banco';

const MAX_FILAS_DATOS = 10_000;

/**
 * Convierte un texto numérico chileno a entero positivo.
 *
 * Acepta separadores de miles (`.` o `,`), descarta decimales y signo.
 * Devuelve null si el texto no es interpretable como número.
 *
 *   "8.103"   → 8103
 *   "-815"    → 815  (el signo se descarta; ver CA-08)
 *   "1.234,5" → 1234 (se trunca la parte decimal)
 *   ""        → 0    (manejado por el caller, no aquí)
 */
function parseMontoEntero(valor: string): number | null {
  const limpio = valor.trim().replace(/\s/g, '');
  if (limpio === '') return null;
  if (!/^-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?$|^-?\d+(?:[.,]\d+)?$/.test(limpio)) {
    return null;
  }
  // Quitamos signo, separadores de miles y parte decimal — solo importa el entero.
  const sinSigno = limpio.replace(/^-/, '');
  const sinSeparadores = sinSigno.replace(/[.,]/g, '');
  // Si tenía parte decimal (último separador antes de 1-2 dígitos), la habríamos
  // incluido en sinSeparadores. Para mantener simplicidad: parseInt sobre el bloque
  // entero. Como CLP en Chile no usa decimales en cartolas, aceptamos esta aproximación.
  const n = parseInt(sinSeparadores, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parsea una fecha en alguno de los formatos aceptados (US-002):
 *   DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY.
 *
 * Devuelve null si el texto no coincide con ningún formato.
 */
function parseFecha(valor: string): Date | null {
  const limpio = valor.trim();
  let y: number, m: number, d: number;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(limpio)) {
    const [dd, mm, yyyy] = limpio.split('/').map(Number);
    d = dd; m = mm; y = yyyy;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(limpio)) {
    const [yyyy, mm, dd] = limpio.split('-').map(Number);
    d = dd; m = mm; y = yyyy;
  } else if (/^\d{2}-\d{2}-\d{4}$/.test(limpio)) {
    const [dd, mm, yyyy] = limpio.split('-').map(Number);
    d = dd; m = mm; y = yyyy;
  } else {
    return null;
  }
  // Validamos rango básico — Date acepta 31/02 silenciosamente.
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return dt;
}

interface StrategyBundle {
  estructura: EstructuraBanco;
  mapeo: MapeoCanonico;
}

export class ExcelTransactionNormalizerService implements ITransactionNormalizer {
  private readonly porBanco: Map<BancoConocido, StrategyBundle>;

  constructor() {
    const strategies = [
      new BancoEstadoStrategy(),
      new BancoChileStrategy(),
      new SantanderStrategy(),
      new BciStrategy(),
    ];
    this.porBanco = new Map(
      strategies.map((s) => [
        s.getEstructura().banco,
        { estructura: s.getEstructura(), mapeo: s.getMapeoCanonico() },
      ]),
    );
  }

  async normalize(
    buffer: Buffer,
    banco: BancoConocido,
  ): Promise<Result<ReadonlyArray<Transaccion>, NormalizacionInvalidaError>> {
    const bundle = this.porBanco.get(banco);
    if (!bundle) {
      return Result.fail(
        new NormalizacionInvalidaError(banco, [
          { tipo: 'FilaSinMontos', fila: 0 },
        ]),
      );
    }

    const workbook = new ExcelJS.Workbook();
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await workbook.xlsx.load(buffer as any);
    } catch {
      return Result.fail(
        new NormalizacionInvalidaError(banco, [
          { tipo: 'FilaSinMontos', fila: 0 },
        ]),
      );
    }

    const ws = workbook.worksheets[0];
    if (!ws) {
      return Result.fail(
        new NormalizacionInvalidaError(banco, [
          { tipo: 'FilaSinMontos', fila: 0 },
        ]),
      );
    }

    const { estructura, mapeo } = bundle;
    const primeraFilaDatos = estructura.filaEncabezados + 1;
    const problemas: ProblemaNormalizacion[] = [];
    const transacciones: Transaccion[] = [];

    for (let i = 0; i < MAX_FILAS_DATOS; i++) {
      const fila = primeraFilaDatos + i;
      const fechaTxt = (ws.getCell(`${mapeo.fecha}${fila}`).text ?? '').trim();
      if (fechaTxt === '') break;

      const descripcion = (ws.getCell(`${mapeo.descripcion}${fila}`).text ?? '').trim();
      const cargoTxt = (ws.getCell(`${mapeo.cargo}${fila}`).text ?? '').trim();
      const abonoTxt = (ws.getCell(`${mapeo.abono}${fila}`).text ?? '').trim();

      const fecha = parseFecha(fechaTxt);
      if (!fecha) {
        problemas.push({ tipo: 'FechaIninterpretable', fila, valor: fechaTxt });
        continue;
      }

      // CA-06: celdas vacías → 0
      let cargo = 0;
      if (cargoTxt !== '') {
        const n = parseMontoEntero(cargoTxt);
        if (n === null) {
          problemas.push({
            tipo: 'MontoIninterpretable',
            fila,
            columna: mapeo.cargo,
          });
          continue;
        }
        // CA-08: BancoEstado expresa cargos como negativos → valor absoluto.
        cargo = mapeo.cargoNegativo ? Math.abs(n) : n;
      }

      let abono = 0;
      if (abonoTxt !== '') {
        const n = parseMontoEntero(abonoTxt);
        if (n === null) {
          problemas.push({
            tipo: 'MontoIninterpretable',
            fila,
            columna: mapeo.abono,
          });
          continue;
        }
        abono = n;
      }

      if (cargo === 0 && abono === 0) {
        problemas.push({ tipo: 'FilaSinMontos', fila });
        continue;
      }

      transacciones.push({ fecha, descripcion, cargo, abono });
    }

    if (problemas.length > 0) {
      return Result.fail(new NormalizacionInvalidaError(banco, problemas));
    }

    return Result.ok(transacciones);
  }
}
