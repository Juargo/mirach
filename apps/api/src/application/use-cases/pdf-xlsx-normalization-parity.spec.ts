import ExcelJS from 'exceljs';
import { readFileSync } from 'fs';
import { join } from 'path';
import { normalizarTransaccionesPdf } from '../../infrastructure/pdf/pdf-normalization';
import { PagedToken } from '../../infrastructure/pdf/pdf-text-extractor';
import { EstructuraPdfBanco } from '../../infrastructure/pdf/strategies/estructura-pdf-banco';
import { ExcelTransactionNormalizerService } from '../../infrastructure/excel/excel-transaction-normalizer.service';
import { PdfjsTransactionNormalizerService } from '../../infrastructure/pdf/pdfjs-transaction-normalizer.service';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { Transaccion } from '../../domain/value-objects/transaccion';

/**
 * Parity D.5 (Phase 6/PR5, spec.md PDF-04 "parity" scenario) — prueba que el
 * pipeline PDF y el pipeline Excel producen transacciones canónicas
 * EQUIVALENTES. Dos niveles, pragmáticos (los 4 fixtures reales de cada
 * formato NO contienen los mismos movimientos, así que la igualdad exacta
 * dato-a-dato entre archivos reales no es posible sin fabricar un par):
 *
 *   1. Parity ESTRUCTURAL: corre ambos normalizadores REALES contra sus
 *      fixtures reales y confirma que cada elemento emitido por ambos
 *      caminos tiene la MISMA forma runtime — { fecha: Date, descripcion:
 *      string, cargo: entero >=0, abono: entero >=0 } — que es exactamente
 *      lo que permite que PersistTransactionsUseCase/categorización/
 *      consolidación (US-011/012/014/015) sean agnósticos del formato de
 *      origen (design.md: "emitting the SAME canonical Transaccion[]").
 *   2. Parity de MOVIMIENTO fabricado: el MISMO movimiento lógico (BancoEstado,
 *      20/04/2026, "PAGO QR SUPERMERCADO", cargo $15.000) expresado como
 *      tokens PDF ya extraídos (vía el núcleo puro `normalizarTransaccionesPdf`
 *      — mismo patrón que pdf-normalization.spec.ts, evita tener que fabricar
 *      bytes de PDF binario reales) Y como una fila de un workbook .xlsx
 *      construido en memoria (vía ExcelJS + ExcelTransactionNormalizerService,
 *      el normalizador REAL, no un núcleo puro) — ambos deben normalizar a la
 *      MISMA `Transaccion` exacta.
 */

function tok(str: string, x: number, y: number, page = 1): PagedToken {
  return { str, x, y, page };
}

/** Rangos calcados de BancoEstadoPdfStrategy.getEstructura() (PR3/PR4b). */
const estructuraBancoEstadoPdf: EstructuraPdfBanco = {
  banco: BancoConocido.BancoEstado,
  anclasEncabezado: [],
  anclasPeriodo: { desde: /x/, hasta: /x/ },
  rangosX: [
    { col: 'fecha', xMin: 40, xMax: 100 },
    { col: 'descripcion', xMin: 150, xMax: 395 },
    { col: 'abono', xMin: 395, xMax: 460 },
    { col: 'cargo', xMin: 460, xMax: 500 },
  ],
  toleranciaY: 3,
  formatoFecha: 'DD/Mmm',
  fuenteAnio: { kind: 'inferido', desde: 'periodo-inicio' },
  filasIgnoradas: [/Subtotales/],
};

async function buildBancoEstadoWorkbook(
  filaDatos: [string, string, string, string, string, number],
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
  filaDatos.forEach((v, idxCol) => {
    ws.getRow(15).getCell(idxCol + 1).value = v;
  });
  const arr = await wb.xlsx.writeBuffer();
  return Buffer.from(arr);
}

/** El MISMO movimiento lógico expresado en cada formato. */
const MOVIMIENTO_ESPERADO: Transaccion = Transaccion.crear({
  fecha: new Date(Date.UTC(2026, 3, 20)),
  descripcion: 'PAGO QR SUPERMERCADO',
  cargo: 15000n,
  abono: 0n,
}).getValue();

function esperarShapeCanonica(txs: ReadonlyArray<Transaccion>): void {
  expect(txs.length).toBeGreaterThan(0);
  for (const tx of txs) {
    expect(tx.fecha).toBeInstanceOf(Date);
    expect(Number.isNaN(tx.fecha.getTime())).toBe(false);
    expect(typeof tx.descripcion).toBe('string');
    expect(typeof tx.cargo).toBe('bigint');
    expect(tx.cargo).toBeGreaterThanOrEqual(0n);
    expect(typeof tx.abono).toBe('bigint');
    expect(tx.abono).toBeGreaterThanOrEqual(0n);
  }
}

describe('Parity D.5 — PDF vs XLSX emiten la misma forma canónica (Phase 6/PR5)', () => {
  it('parity estructural: el normalizador PDF real (fixture real) y el normalizador Excel real (fixture real) emiten la MISMA forma { fecha, descripcion, cargo, abono }', async () => {
    const pdfFixture = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        '..',
        'test',
        'fixtures',
        'pdf',
        'santander-cartola-test.pdf',
      ),
    );
    const xlsxFixture = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        '..',
        'test',
        'fixtures',
        'movimientos-test.xlsx',
      ),
    );

    const pdfResult = await new PdfjsTransactionNormalizerService().normalize(
      pdfFixture,
      BancoConocido.Santander,
    );
    const xlsxResult = await new ExcelTransactionNormalizerService().normalize(
      xlsxFixture,
      BancoConocido.BCI,
    );

    expect(pdfResult.isOk()).toBe(true);
    expect(xlsxResult.isOk()).toBe(true);
    esperarShapeCanonica(pdfResult.getValue());
    esperarShapeCanonica(xlsxResult.getValue());
  });

  it('parity de movimiento fabricado: el mismo movimiento lógico (BancoEstado, 20/04/2026, "PAGO QR SUPERMERCADO", cargo $15.000) normaliza IGUAL vía PDF y vía XLSX', async () => {
    // --- PDF: tokens ya extraídos (núcleo puro, mismo patrón que pdf-normalization.spec.ts) ---
    const tokensPdf = [
      tok('20/Abr', 50, 100),
      tok('PAGO', 160, 100),
      tok('QR', 200, 100),
      tok('SUPERMERCADO', 230, 100),
      tok('$15.000', 470, 100),
    ];
    const periodoAbril2026 = { desde: '2026-04-01', hasta: '2026-04-30' };
    const pdfResult = normalizarTransaccionesPdf(
      tokensPdf,
      estructuraBancoEstadoPdf,
      periodoAbril2026,
    );
    expect(pdfResult.isOk()).toBe(true);
    expect(pdfResult.getValue()).toEqual([MOVIMIENTO_ESPERADO]);

    // --- XLSX: fila real de un workbook BancoEstado en memoria (normalizador REAL) ---
    const xlsxBuffer = await buildBancoEstadoWorkbook([
      '20/04/2026',
      '8028918',
      'PAGO QR SUPERMERCADO',
      '-15000', // BancoEstado expresa cargos como negativos (CA-08) — abs() al normalizar
      '',
      1234,
    ]);
    const xlsxResult = await new ExcelTransactionNormalizerService().normalize(
      xlsxBuffer,
      BancoConocido.BancoEstado,
    );
    expect(xlsxResult.isOk()).toBe(true);
    expect(xlsxResult.getValue()).toEqual([MOVIMIENTO_ESPERADO]);

    // --- Parity: mismo movimiento lógico, misma Transaccion canónica exacta ---
    expect(pdfResult.getValue()).toEqual(xlsxResult.getValue());
  });
});
