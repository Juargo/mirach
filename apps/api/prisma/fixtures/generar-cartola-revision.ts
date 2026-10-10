import ExcelJS from 'exceljs';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Generates `cartola-revision.xlsx`, the synthetic statement the App Review
 * account is loaded with (ADR-051). Layout: the BCI "Últimos Movimientos"
 * export, which the real parser detects by A1/A8 (see CLAUDE.md of the API).
 *
 * Every merchant is fictitious and tagged "EJEMPLO". A few glosas carry a
 * keyword the default catalog already classifies (supermercado, bencina,
 * farmacia, streaming...), so the reviewer sees the three 50/30/20 buckets
 * filled, plus two movements that fall into the default "Desconocido".
 *
 * Dates span September and the first week of October 2026 (the review
 * window). Regenerate with:
 *   pnpm --filter @mirach/api exec tsx prisma/fixtures/generar-cartola-revision.ts
 */

interface Movimiento {
  readonly fecha: string; // DD/MM/YYYY
  readonly descripcion: string;
  readonly cargo?: string; // es-CL formatted, e.g. "68.450"
  readonly abono?: string;
}

export const MOVIMIENTOS_REVISION: ReadonlyArray<Movimiento> = [
  // ── September 2026 ──
  {
    fecha: '01/09/2026',
    descripcion: 'Transferencia recibida de EMPRESA EJEMPLO SPA SUELDO',
    abono: '1.200.000',
  },
  {
    fecha: '02/09/2026',
    descripcion:
      'Compra con Tarjeta de Débito en SUPERMERCADO LIDER EJEMPLO  CHL',
    cargo: '68.450',
  },
  {
    fecha: '03/09/2026',
    descripcion: 'Pago de Servicios ENEL Cuenta Luz EJEMPLO',
    cargo: '41.200',
  },
  {
    fecha: '04/09/2026',
    descripcion: 'Pago de Servicios AGUAS ANDINAS EJEMPLO',
    cargo: '18.900',
  },
  {
    fecha: '05/09/2026',
    descripcion: 'Compra con Tarjeta de Débito en COPEC EJEMPLO  CHL',
    cargo: '35.000',
  },
  {
    fecha: '06/09/2026',
    descripcion: 'Suscripcion NETFLIX EJEMPLO',
    cargo: '8.990',
  },
  {
    fecha: '07/09/2026',
    descripcion: 'Compra con Tarjeta de Débito en FARMACIA EJEMPLO  CHL',
    cargo: '14.790',
  },
  {
    fecha: '08/09/2026',
    descripcion: 'Pago de Servicios MOVISTAR Internet EJEMPLO',
    cargo: '24.990',
  },
  {
    fecha: '09/09/2026',
    descripcion:
      'Compra con Tarjeta de Débito en SUPERMERCADO JUMBO EJEMPLO  CHL',
    cargo: '92.300',
  },
  {
    fecha: '10/09/2026',
    descripcion: 'Compra con Tarjeta de Débito en RESTAURANTE EJEMPLO  CHL',
    cargo: '28.500',
  },
  {
    fecha: '12/09/2026',
    descripcion: 'Compra con Tarjeta de Débito en RAPPI EJEMPLO  CHL',
    cargo: '15.400',
  },
  {
    fecha: '13/09/2026',
    descripcion: 'Compra con Tarjeta de Débito en TIENDA RETAIL EJEMPLO  CHL',
    cargo: '54.990',
  },
  {
    fecha: '15/09/2026',
    descripcion: 'Transferencia a Cuenta Ahorro EJEMPLO',
    cargo: '240.000',
  },
  {
    fecha: '16/09/2026',
    descripcion: 'Suscripcion SPOTIFY EJEMPLO',
    cargo: '5.990',
  },
  {
    fecha: '18/09/2026',
    descripcion:
      'Compra con Tarjeta de Débito en SUPERMERCADO UNIMARC EJEMPLO  CHL',
    cargo: '61.800',
  },
  {
    fecha: '20/09/2026',
    descripcion: 'Recarga tarjeta BIP EJEMPLO',
    cargo: '10.000',
  },
  {
    fecha: '22/09/2026',
    descripcion:
      'Compra con Tarjeta de Débito en COPEC EJEMPLO ESTACION NORTE  CHL',
    cargo: '32.000',
  },
  {
    fecha: '24/09/2026',
    descripcion: 'Compra con Tarjeta de Débito en CINE EJEMPLO  CHL',
    cargo: '21.000',
  },
  { fecha: '26/09/2026', descripcion: 'Pago ISAPRE EJEMPLO', cargo: '95.000' },
  {
    fecha: '28/09/2026',
    descripcion: 'Abono por Reembolso EJEMPLO',
    abono: '25.000',
  },
  // ── October 2026 (first week) ──
  {
    fecha: '01/10/2026',
    descripcion: 'Transferencia recibida de EMPRESA EJEMPLO SPA SUELDO',
    abono: '1.200.000',
  },
  {
    fecha: '02/10/2026',
    descripcion:
      'Compra con Tarjeta de Débito en SUPERMERCADO LIDER EJEMPLO  CHL',
    cargo: '54.300',
  },
  {
    fecha: '03/10/2026',
    descripcion: 'Pago de Servicios ENEL Cuenta Luz EJEMPLO',
    cargo: '39.800',
  },
  {
    fecha: '04/10/2026',
    descripcion: 'Suscripcion NETFLIX EJEMPLO',
    cargo: '8.990',
  },
  {
    fecha: '05/10/2026',
    descripcion: 'Compra con Tarjeta de Débito en FARMACIA EJEMPLO  CHL',
    cargo: '9.990',
  },
  {
    fecha: '06/10/2026',
    descripcion: 'Compra con Tarjeta de Débito en RAPPI EJEMPLO  CHL',
    cargo: '12.700',
  },
  {
    fecha: '07/10/2026',
    descripcion: 'Compra con Tarjeta de Débito en TIENDA RETAIL EJEMPLO  CHL',
    cargo: '33.990',
  },
  {
    fecha: '08/10/2026',
    descripcion: 'Transferencia a Cuenta Ahorro EJEMPLO',
    cargo: '100.000',
  },
];

export async function construirCartolaRevision(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('movimientos');

  // Header block (rows 1-7) and column headers (row 8), as the BCI export.
  sheet.getCell('A1').value = 'Últimos Movimientos';
  const resumen: ReadonlyArray<readonly [string, string]> = [
    ['Saldo Disponible', '1.500.000'],
    ['Saldo Contable', '1.500.000'],
    ['Retenciones', '0'],
    ['Sobregiro Disponible', '2.000.000'],
    ['Sobregiro Utilizado', '0'],
    ['Línea de Emergencia', '0'],
  ];
  resumen.forEach(([etiqueta, valor], i) => {
    sheet.getCell(2 + i, 4).value = etiqueta;
    sheet.getCell(2 + i, 5).value = valor;
  });
  [
    'Fecha Transacción',
    'Fecha Contable',
    'Descripción',
    'N° Documento',
    'Sucursal',
    'Canal',
    'Cargo $',
    'Abono $',
  ].forEach((titulo, i) => {
    sheet.getCell(8, 1 + i).value = titulo;
  });

  // Data rows from row 9. Dates and amounts are text, like the real export.
  MOVIMIENTOS_REVISION.forEach((m, i) => {
    const fila = 9 + i;
    sheet.getCell(fila, 1).value = m.fecha;
    sheet.getCell(fila, 2).value = m.fecha;
    sheet.getCell(fila, 3).value = m.descripcion;
    if (m.cargo !== undefined) sheet.getCell(fila, 7).value = m.cargo;
    if (m.abono !== undefined) sheet.getCell(fila, 8).value = m.abono;
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// Runs only as a script (tsx), not when imported by a spec.
if (require.main === module) {
  construirCartolaRevision()
    .then((buffer) => {
      writeFileSync(path.join(__dirname, 'cartola-revision.xlsx'), buffer);
      console.log('cartola-revision.xlsx generado.');
    })
    .catch((error: unknown) => {
      console.error('No se pudo generar cartola-revision.xlsx:', error);
      process.exitCode = 1;
    });
}
