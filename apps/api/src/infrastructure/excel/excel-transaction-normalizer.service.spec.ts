import ExcelJS from 'exceljs';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ExcelTransactionNormalizerService } from './excel-transaction-normalizer.service';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';

const FIXTURES = join(__dirname, '..', '..', '..', 'test', 'fixtures');

async function workbookABuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  const arr = await wb.xlsx.writeBuffer();
  return Buffer.from(arr as ArrayBuffer);
}

async function buildBancoEstadoWorkbook(
  filasDatos: Array<Array<string | number>>,
): Promise<Buffer> {
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

describe('ExcelTransactionNormalizerService', () => {
  let service: ExcelTransactionNormalizerService;

  beforeEach(() => {
    service = new ExcelTransactionNormalizerService();
  });

  describe('CA-01: mapeo al esquema canónico', () => {
    it('mapea filas BancoEstado a { fecha, descripcion, cargo, abono }', async () => {
      const buffer = await buildBancoEstadoWorkbook([
        ['20/04/2026', '8028918', 'PAGO QR', '-815', '', 2386],
        ['19/04/2026', '8028000', 'TRANSF RECIBIDA', '', '1500', 3886],
      ]);

      const result = await service.normalize(buffer, BancoConocido.BancoEstado);

      expect(result.isOk()).toBe(true);
      const tx = result.getValue();
      expect(tx).toHaveLength(2);
      expect(tx[0]).toEqual({
        fecha: new Date(Date.UTC(2026, 3, 20)),
        descripcion: 'PAGO QR',
        cargo: 815,
        abono: 0,
      });
      expect(tx[1]).toEqual({
        fecha: new Date(Date.UTC(2026, 3, 19)),
        descripcion: 'TRANSF RECIBIDA',
        cargo: 0,
        abono: 1500,
      });
    });
  });

  describe('CA-06: celdas vacías → 0', () => {
    it('asigna 0 cuando el cargo está vacío', async () => {
      const buffer = await buildBancoEstadoWorkbook([
        ['01/05/2026', '1', 'ABONO', '', '1000', 1000],
      ]);
      const result = await service.normalize(buffer, BancoConocido.BancoEstado);
      expect(result.isOk()).toBe(true);
      expect(result.getValue()[0].cargo).toBe(0);
      expect(result.getValue()[0].abono).toBe(1000);
    });

    it('asigna 0 cuando el abono está vacío', async () => {
      const buffer = await buildBancoEstadoWorkbook([
        ['01/05/2026', '1', 'CARGO', '-500', '', 500],
      ]);
      const result = await service.normalize(buffer, BancoConocido.BancoEstado);
      expect(result.isOk()).toBe(true);
      expect(result.getValue()[0].cargo).toBe(500);
      expect(result.getValue()[0].abono).toBe(0);
    });
  });

  describe('CA-07: separadores de miles', () => {
    it('convierte "8.103" a 8103', async () => {
      const buffer = await buildBancoEstadoWorkbook([
        ['01/05/2026', '1', 'COMPRA', '-8.103', '', 0],
      ]);
      const result = await service.normalize(buffer, BancoConocido.BancoEstado);
      expect(result.isOk()).toBe(true);
      expect(result.getValue()[0].cargo).toBe(8103);
    });
  });

  describe('CA-08: cargos negativos → valor absoluto (BancoEstado)', () => {
    it('convierte -815 a 815 en el campo cargo', async () => {
      const buffer = await buildBancoEstadoWorkbook([
        ['01/05/2026', '1', 'X', -815, '', 0],
      ]);
      const result = await service.normalize(buffer, BancoConocido.BancoEstado);
      expect(result.isOk()).toBe(true);
      expect(result.getValue()[0].cargo).toBe(815);
    });
  });

  describe('Fila con ambas celdas vacías', () => {
    it('reporta error FilaSinMontos cuando cargo y abono están vacíos', async () => {
      const buffer = await buildBancoEstadoWorkbook([
        ['01/05/2026', '1', 'RARO', '', '', 0],
      ]);
      const result = await service.normalize(buffer, BancoConocido.BancoEstado);
      expect(result.isFail()).toBe(true);
      expect(result.getError().problemas[0]).toMatchObject({
        tipo: 'FilaSinMontos',
        fila: 15,
      });
    });
  });

  describe('Detiene al encontrar fila con fecha vacía', () => {
    it('no procesa filas posteriores a una fecha vacía', async () => {
      const buffer = await buildBancoEstadoWorkbook([
        ['01/05/2026', '1', 'A', '-100', '', 0],
        ['', '', '', '', '', ''],
        ['02/05/2026', '2', 'B', '-200', '', 0],
      ]);
      const result = await service.normalize(buffer, BancoConocido.BancoEstado);
      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toHaveLength(1);
    });
  });

  describe('Fixtures reales', () => {
    it('normaliza fixture BancoEstado completo sin errores', async () => {
      const buffer = readFileSync(
        join(FIXTURES, 'Últimos_Movimientos_CuentaRUT_test.xlsx'),
      );
      const result = await service.normalize(buffer, BancoConocido.BancoEstado);
      expect(result.isOk()).toBe(true);
      const tx = result.getValue();
      expect(tx.length).toBeGreaterThan(0);
      for (const t of tx) {
        expect(t.cargo).toBeGreaterThanOrEqual(0);
        expect(t.abono).toBeGreaterThanOrEqual(0);
        // Cargo y abono son mutuamente excluyentes
        expect(t.cargo === 0 || t.abono === 0).toBe(true);
      }
    });

    it('normaliza fixture BCI completo sin errores', async () => {
      const buffer = readFileSync(join(FIXTURES, 'movimientos-test.xlsx'));
      const result = await service.normalize(buffer, BancoConocido.BCI);
      expect(result.isOk()).toBe(true);
      const tx = result.getValue();
      expect(tx.length).toBeGreaterThan(0);
      for (const t of tx) {
        expect(t.cargo).toBeGreaterThanOrEqual(0);
        expect(t.abono).toBeGreaterThanOrEqual(0);
      }
    });

    it('normaliza fixture Santander completo sin errores', async () => {
      const buffer = readFileSync(
        join(FIXTURES, 'ultimos movimientos-Cuenta Corriente-test.xlsx'),
      );
      const result = await service.normalize(buffer, BancoConocido.Santander);
      expect(result.isOk()).toBe(true);
      const tx = result.getValue();
      expect(tx.length).toBeGreaterThan(0);
    });
  });
});
