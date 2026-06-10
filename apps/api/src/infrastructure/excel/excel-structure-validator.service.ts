import ExcelJS from 'exceljs';
import { Result } from '../../shared/result';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { TipoColumna } from '../../domain/value-objects/tipo-columna';
import { ColumnaEsperada } from '../../domain/value-objects/columna-esperada';
import {
  EstructuraInvalidaError,
  ProblemaEstructura,
} from '../../domain/errors/estructura-invalida.error';
import {
  IStructureValidator,
  ValidatedStructure,
} from '../../application/ports/structure-validator.port';
import { BancoChileStrategy } from './strategies/banco-chile.strategy';
import { BancoEstadoStrategy } from './strategies/banco-estado.strategy';
import { BciStrategy } from './strategies/bci.strategy';
import { SantanderStrategy } from './strategies/santander.strategy';
import { EstructuraBanco } from './strategies/estructura-banco';

/**
 * Formatos de fecha aceptados (decisión stakeholder 2026-05-14, extendida
 * para soportar DD-MM-YYYY que usa Santander).
 *
 *   DD/MM/YYYY   → 14/05/2026
 *   YYYY-MM-DD   → 2026-05-14
 *   DD-MM-YYYY   → 14-05-2026
 */
const FORMATOS_FECHA = [
  /^\d{2}\/\d{2}\/\d{4}$/,
  /^\d{4}-\d{2}-\d{2}$/,
  /^\d{2}-\d{2}-\d{4}$/,
];

/** Permite números con separador de miles (`.` o `,`) y decimales opcionales. */
const PATRON_NUMERO = /^-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?$|^-?\d+(?:[.,]\d+)?$/;

/** Límite de filas a leer tras los encabezados — evita loops sobre hojas con miles de filas vacías. */
const MAX_FILAS_DATOS = 10_000;

export class ExcelStructureValidatorService implements IStructureValidator {
  private readonly estructurasPorBanco: Map<BancoConocido, EstructuraBanco>;

  constructor() {
    const strategies = [
      new BancoEstadoStrategy(),
      new BancoChileStrategy(),
      new SantanderStrategy(),
      new BciStrategy(),
    ];
    this.estructurasPorBanco = new Map(
      strategies.map((s) => {
        const e = s.getEstructura();
        return [e.banco, e];
      }),
    );
  }

  async validate(
    buffer: Buffer,
    banco: BancoConocido,
  ): Promise<Result<ValidatedStructure, EstructuraInvalidaError>> {
    const estructura = this.estructurasPorBanco.get(banco);
    if (!estructura) {
      return Result.fail(
        new EstructuraInvalidaError(banco, [
          {
            tipo: 'ColumnaFaltante',
            columna: '-',
            esperado: 'estructura definida',
            encontrado: 'sin definición para este banco',
          },
        ]),
      );
    }

    const workbook = new ExcelJS.Workbook();
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await workbook.xlsx.load(buffer as any);
    } catch {
      return Result.fail(
        new EstructuraInvalidaError(banco, [
          { tipo: 'SinEncabezados', fila: estructura.filaEncabezados },
        ]),
      );
    }

    const ws = workbook.worksheets[0];
    if (!ws) {
      return Result.fail(
        new EstructuraInvalidaError(banco, [
          { tipo: 'SinEncabezados', fila: estructura.filaEncabezados },
        ]),
      );
    }

    const problemas: ProblemaEstructura[] = [];

    // 1. Fila de encabezados completamente vacía → SinEncabezados.
    const headerVacia = estructura.columnas.every(
      (c) => (ws.getCell(`${c.letra}${estructura.filaEncabezados}`).text ?? '').trim() === '',
    );
    if (headerVacia) {
      problemas.push({ tipo: 'SinEncabezados', fila: estructura.filaEncabezados });
      return Result.fail(new EstructuraInvalidaError(banco, problemas));
    }

    // 2. Validar nombre de cada columna esperada (CA-01).
    for (const col of estructura.columnas) {
      const encontrado = (ws.getCell(`${col.letra}${estructura.filaEncabezados}`).text ?? '').trim();
      if (encontrado !== col.nombre) {
        problemas.push({
          tipo: 'ColumnaFaltante',
          columna: `${col.letra}${estructura.filaEncabezados}`,
          esperado: col.nombre,
          encontrado,
        });
      }
    }

    // Si faltan columnas, no tiene sentido revisar tipos sobre celdas que podrían
    // estar en lugares distintos. Reportamos ahora.
    if (problemas.length > 0) {
      return Result.fail(new EstructuraInvalidaError(banco, problemas));
    }

    // 3. Validar tipo de datos por fila (CA-02). Una fila cuenta como "con datos"
    // si la primera columna requerida (típicamente la fecha) tiene contenido.
    const primeraFilaDatos = estructura.filaEncabezados + 1;
    const colReferencia = estructura.columnas[0];
    let totalFilasDatos = 0;

    for (let i = 0; i < MAX_FILAS_DATOS; i++) {
      const fila = primeraFilaDatos + i;
      const refTexto = (ws.getCell(`${colReferencia.letra}${fila}`).text ?? '').trim();
      if (refTexto === '') break;
      totalFilasDatos++;

      for (const col of estructura.columnas) {
        const valor = (ws.getCell(`${col.letra}${fila}`).text ?? '').trim();
        if (valor === '') continue; // Celdas vacías en columnas no-referencia se aceptan.
        if (!this.valorCoincideTipo(valor, col.tipo)) {
          problemas.push({
            tipo: 'TipoIncorrecto',
            columna: col.nombre,
            fila,
            tipoEsperado: this.describirTipo(col.tipo),
            valor,
          });
        }
      }
    }

    if (problemas.length > 0) {
      return Result.fail(new EstructuraInvalidaError(banco, problemas));
    }

    return Result.ok({
      banco,
      filaEncabezados: estructura.filaEncabezados,
      primeraFilaDatos,
      totalFilasDatos,
    });
  }

  private valorCoincideTipo(valor: string, tipo: TipoColumna): boolean {
    switch (tipo) {
      case TipoColumna.Texto:
        return true;
      case TipoColumna.Numero:
        return PATRON_NUMERO.test(valor);
      case TipoColumna.Fecha:
        return FORMATOS_FECHA.some((re) => re.test(valor));
    }
  }

  private describirTipo(tipo: TipoColumna): string {
    switch (tipo) {
      case TipoColumna.Fecha:
        return 'una fecha (DD/MM/YYYY, YYYY-MM-DD o DD-MM-YYYY)';
      case TipoColumna.Numero:
        return 'un número';
      case TipoColumna.Texto:
        return 'texto';
    }
  }
}
