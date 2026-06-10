import ExcelJS from 'exceljs';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ExcelStructureValidatorService } from './excel-structure-validator.service';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { EstructuraInvalidaError } from '../../domain/errors/estructura-invalida.error';

const FIXTURES = join(__dirname, '..', '..', '..', 'test', 'fixtures');

async function workbookABuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  const arr = await wb.xlsx.writeBuffer();
  return Buffer.from(arr as ArrayBuffer);
}

/** Crea un workbook BancoEstado mínimo con encabezados en fila 14 y filas de datos opcionales. */
async function buildBancoEstadoWorkbook(filasDatos: Array<Array<string | number>> = []): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('hoja');
  ws.getCell('A1').value = 'Últimos Movimientos CuentaRUT N° 00017046102';
  const headers = [
    'Fecha',
    'N° Operación',
    'Descripción',
    'Cheques / Cargos $',
    'Depósitos / Abonos $',
    'Saldo $',
  ];
  headers.forEach((h, i) => (ws.getRow(14).getCell(i + 1).value = h));
  filasDatos.forEach((fila, idxFila) => {
    fila.forEach((v, idxCol) => {
      ws.getRow(15 + idxFila).getCell(idxCol + 1).value = v;
    });
  });
  return workbookABuffer(wb);
}

describe('ExcelStructureValidatorService', () => {
  let service: ExcelStructureValidatorService;

  beforeEach(() => {
    service = new ExcelStructureValidatorService();
  });

  describe('CA-03: archivo con estructura correcta', () => {
    it('acepta BancoEstado con encabezados y datos válidos', async () => {
      const buffer = await buildBancoEstadoWorkbook([
        ['20/04/2026', '8028918', 'PAGO QR', -815, 0, 2386],
        ['31/03/2026', '8006290', 'CARGO X', -815, 0, 3201],
      ]);

      const result = await service.validate(buffer, BancoConocido.BancoEstado);

      expect(result.isOk()).toBe(true);
      const data = result.getValue();
      expect(data.filaEncabezados).toBe(14);
      expect(data.primeraFilaDatos).toBe(15);
      expect(data.totalFilasDatos).toBe(2);
    });

    it('acepta archivo con solo encabezados (sin filas de datos)', async () => {
      const buffer = await buildBancoEstadoWorkbook([]);

      const result = await service.validate(buffer, BancoConocido.BancoEstado);

      expect(result.isOk()).toBe(true);
      expect(result.getValue().totalFilasDatos).toBe(0);
    });

    it('acepta fechas en formato YYYY-MM-DD', async () => {
      const buffer = await buildBancoEstadoWorkbook([
        ['2026-04-20', '8028918', 'PAGO', -815, 0, 2386],
      ]);

      const result = await service.validate(buffer, BancoConocido.BancoEstado);

      expect(result.isOk()).toBe(true);
    });

    it('acepta fechas en formato DD-MM-YYYY (Santander)', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('hoja');
      ws.getCell('A2').value = 'Cuenta Corriente: 0-000-83-03862-4';
      const headers = ['Fecha', 'Detalle', 'Monto cargo ($)', 'Monto abono ($)', 'Saldo ($)'];
      headers.forEach((h, i) => (ws.getRow(3).getCell(i + 1).value = h));
      ws.getRow(4).getCell(1).value = '17-04-2026';
      ws.getRow(4).getCell(2).value = 'RECUP COM';
      ws.getRow(4).getCell(3).value = 3177;
      ws.getRow(4).getCell(5).value = 1470;
      const buffer = await workbookABuffer(wb);

      const result = await service.validate(buffer, BancoConocido.Santander);

      expect(result.isOk()).toBe(true);
    });

    it('ignora columnas extra no reconocidas', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('hoja');
      ws.getCell('A1').value = 'Últimos Movimientos CuentaRUT N° 00017046102';
      const headers = [
        'Fecha',
        'N° Operación',
        'Descripción',
        'Cheques / Cargos $',
        'Depósitos / Abonos $',
        'Saldo $',
        'Columna extra',
      ];
      headers.forEach((h, i) => (ws.getRow(14).getCell(i + 1).value = h));
      ws.getRow(15).getCell(1).value = '20/04/2026';
      ws.getRow(15).getCell(2).value = '8028918';
      ws.getRow(15).getCell(3).value = 'desc';
      ws.getRow(15).getCell(4).value = -815;
      ws.getRow(15).getCell(5).value = 0;
      ws.getRow(15).getCell(6).value = 2386;
      ws.getRow(15).getCell(7).value = 'irrelevante';
      const buffer = await workbookABuffer(wb);

      const result = await service.validate(buffer, BancoConocido.BancoEstado);

      expect(result.isOk()).toBe(true);
    });
  });

  describe('CA-01: columnas faltantes', () => {
    it('rechaza cuando falta una columna requerida y reporta cuál', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('hoja');
      ws.getCell('A1').value = 'Últimos Movimientos CuentaRUT N° 00017046102';
      // Falta "N° Operación" en B14
      ws.getRow(14).getCell(1).value = 'Fecha';
      ws.getRow(14).getCell(2).value = 'Otra cosa';
      ws.getRow(14).getCell(3).value = 'Descripción';
      ws.getRow(14).getCell(4).value = 'Cheques / Cargos $';
      ws.getRow(14).getCell(5).value = 'Depósitos / Abonos $';
      ws.getRow(14).getCell(6).value = 'Saldo $';
      const buffer = await workbookABuffer(wb);

      const result = await service.validate(buffer, BancoConocido.BancoEstado);

      expect(result.isFail()).toBe(true);
      const err = result.getError();
      expect(err).toBeInstanceOf(EstructuraInvalidaError);
      expect(err.problemas).toHaveLength(1);
      expect(err.problemas[0]).toMatchObject({
        tipo: 'ColumnaFaltante',
        esperado: 'N° Operación',
      });
    });

    it('reporta todas las columnas faltantes en una sola pasada', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('hoja');
      ws.getCell('A1').value = 'Últimos Movimientos CuentaRUT';
      ws.getRow(14).getCell(1).value = 'Fecha';
      ws.getRow(14).getCell(2).value = 'Otra';
      ws.getRow(14).getCell(3).value = 'Cosa';
      const buffer = await workbookABuffer(wb);

      const result = await service.validate(buffer, BancoConocido.BancoEstado);

      expect(result.isFail()).toBe(true);
      // Espera reporte de B (N° Operación), C (Descripción), D, E, F
      expect(result.getError().problemas.length).toBeGreaterThanOrEqual(4);
    });

    it('rechaza archivo sin encabezados (fila de encabezados vacía)', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('hoja');
      ws.getCell('A1').value = 'Últimos Movimientos CuentaRUT';
      const buffer = await workbookABuffer(wb);

      const result = await service.validate(buffer, BancoConocido.BancoEstado);

      expect(result.isFail()).toBe(true);
      expect(result.getError().problemas[0]).toMatchObject({
        tipo: 'SinEncabezados',
        fila: 14,
      });
    });
  });

  describe('CA-02: tipos de datos incorrectos', () => {
    it('rechaza fecha en formato no reconocido y reporta columna y fila', async () => {
      const buffer = await buildBancoEstadoWorkbook([
        ['Mayo 13, 2026', '8028918', 'PAGO', -815, 0, 2386],
      ]);

      const result = await service.validate(buffer, BancoConocido.BancoEstado);

      expect(result.isFail()).toBe(true);
      const err = result.getError();
      expect(err.problemas).toHaveLength(1);
      expect(err.problemas[0]).toMatchObject({
        tipo: 'TipoIncorrecto',
        columna: 'Fecha',
        fila: 15,
      });
      expect(err.message).toContain('Mayo 13, 2026');
    });

    it('rechaza texto donde se espera número', async () => {
      const buffer = await buildBancoEstadoWorkbook([
        ['20/04/2026', '8028918', 'PAGO', 'no-es-numero', 0, 2386],
      ]);

      const result = await service.validate(buffer, BancoConocido.BancoEstado);

      expect(result.isFail()).toBe(true);
      const problemas = result.getError().problemas;
      expect(problemas[0]).toMatchObject({
        tipo: 'TipoIncorrecto',
        columna: 'Cheques / Cargos $',
        fila: 15,
      });
    });

    it('acepta números con separador de miles (BCI: "8.103")', async () => {
      // Validamos directamente sobre el patrón al construir un workbook BCI.
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('hoja');
      ws.getCell('A1').value = 'Últimos Movimientos';
      ws.getRow(8).getCell(1).value = 'Fecha Transacción';
      ws.getRow(8).getCell(2).value = 'Fecha Contable';
      ws.getRow(8).getCell(3).value = 'Descripción';
      ws.getRow(8).getCell(7).value = 'Cargo $';
      ws.getRow(8).getCell(8).value = 'Abono $';
      ws.getRow(9).getCell(1).value = '13/05/2026';
      ws.getRow(9).getCell(2).value = '14/05/2026';
      ws.getRow(9).getCell(3).value = 'Compra';
      ws.getRow(9).getCell(7).value = '8.103';
      const buffer = await workbookABuffer(wb);

      const result = await service.validate(buffer, BancoConocido.BCI);

      expect(result.isOk()).toBe(true);
    });
  });

  describe('integración con fixtures reales', () => {
    it('valida la cartola real de BancoEstado', async () => {
      const buffer = readFileSync(
        join(FIXTURES, 'Últimos_Movimientos_CuentaRUT_1778764122306.xlsx'),
      );
      const result = await service.validate(buffer, BancoConocido.BancoEstado);
      expect(result.isOk()).toBe(true);
    });

    it('valida la cartola real de Santander', async () => {
      const buffer = readFileSync(
        join(FIXTURES, 'ultimos movimientos-Cuenta Corriente.xlsx'),
      );
      const result = await service.validate(buffer, BancoConocido.Santander);
      expect(result.isOk()).toBe(true);
    });

    it('valida la cartola real de BCI', async () => {
      const buffer = readFileSync(join(FIXTURES, 'movimientos.xlsx'));
      const result = await service.validate(buffer, BancoConocido.BCI);
      expect(result.isOk()).toBe(true);
    });
  });
});
