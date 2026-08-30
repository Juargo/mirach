/**
 * Generador del fixture `bancochile-cartola-montos-grandes-test.pdf` —
 * cartola Banco de Chile 100% SINTÉTICA (persona, cuenta, contrapartes y
 * montos ficticios) que replica la geometría medida contra 16 cartolas
 * reales (2026-08-30, ver docblock de `BancoChilePdfStrategy`) para pinnear
 * la recalibración de `rangosX` y los casos que el fixture original
 * (`bancochile-cartola-test.pdf`, montos chicos) no cubría:
 *
 *   - Abono ANCHO de 8 dígitos ("15.000.000") arrancando en x≈472.6 — las
 *     columnas de monto están alineadas a la derecha, así que el x de inicio
 *     corre hacia la izquierda con el ancho del monto (bug real: la banda
 *     original [495, 520) perdía TODOS los abonos medianos/anchos, ambas
 *     columnas quedaban vacías y el saldo disparaba
 *     `TokenSinAsignarSospechoso` por fila).
 *   - Abonos mediano ("276.500" en x≈482.7) y mínimo ("500" en x≈496.4) —
 *     el rango real completo [472.0, 503.1].
 *   - Cargo ancho ("12.345.678" en x≈392.5) y cargo de 1 dígito ("7" en
 *     x≈423.1, el inicio máximo observado).
 *   - Filas fechadas SIN saldo corrido (varios movimientos del mismo día
 *     comparten el último saldo — patrón real).
 *   - "SALDO INICIAL"/"SALDO FINAL": filas CON fecha cuyo único monto es el
 *     saldo (fuera de banda) — sin `filasIgnoradas` dispararían la guarda
 *     money-safe.
 *   - Secciones de resumen SIN fecha del pie de página: la ecuación
 *     DEPOSITOS/OTROS ABONOS/OTROS CARGOS (valores en x≈254/347, fuera de
 *     toda banda) y "SALDO DISPONIBLE A LA FECHA" con su valor ancho en
 *     x≈543.4 — a 5pt del inicio de un saldo ancho real, pinnea que la
 *     banda abono termina antes.
 *
 * PDF crudo, sin dependencias: mismas técnicas que
 * `generar-bci-cartola-montos-grandes-test.ts` (streams sin comprimir,
 * operadores BT/Tm/Tj, espaciador con salto de pluma hacia atrás en x=599
 * para que pdfjs no fusione columnas de la misma línea, Helvetica
 * /WinAnsiEncoding escrita en latin1 para que "°" sobreviva).
 *
 * Regenerar (desde apps/api):
 *   pnpm exec tsx test/fixtures/pdf/generar-bancochile-cartola-montos-grandes-test.ts
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface TokenPdf {
  readonly str: string;
  readonly x: number;
  readonly y: number;
}

function t(str: string, x: number, y: number): TokenPdf {
  return { str, x, y };
}

/** Escapa los delimitadores de string literal de PDF. */
function escaparPdf(texto: string): string {
  return texto
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function contenidoPagina(tokens: ReadonlyArray<TokenPdf>): string {
  // Ver generar-bci-cartola-montos-grandes-test.ts: el run espaciador en
  // x=599 fuerza un salto de pluma hacia atrás antes del siguiente token
  // real, cortando la fusión de items de pdfjs sin contaminar ninguna banda.
  const lineas = tokens.map(
    (tok) =>
      `BT /F1 9 Tf 1 0 0 1 ${tok.x.toFixed(1)} ${tok.y.toFixed(1)} Tm (${escaparPdf(tok.str)}) Tj ET\n` +
      `BT /F1 9 Tf 1 0 0 1 599.0 ${tok.y.toFixed(1)} Tm ( ) Tj ET`,
  );
  return lineas.join('\n');
}

// ---------------------------------------------------------------------------
// Contenido sintético. Saldo inicial 20.000.000; el saldo corrido y la
// ecuación del resumen cuadran exactos:
//   cargos 13.281.108 · abonos 15.277.000 · saldo final 21.995.892.
// ---------------------------------------------------------------------------

const pagina1: TokenPdf[] = [
  // Encabezado con las DOS anclas de detección (Title Case + mayúsculas).
  t('Estado de Cuenta', 507.5, 711.0),
  t('00987654322026053100', 208.1, 691.0),
  t('CUENTA CORRIENTE', 478.3, 691.0),
  t('LINEA DE CREDITO', 321.7, 670.0),
  t('SR(A)(ES)', 20.0, 661.0),
  t('APROBADO', 269.0, 658.0),
  t(':', 347.0, 658.0),
  t('750.000', 402.1, 658.0),
  t('Clienta Ficticia Ejemplo', 20.0, 649.0),
  t('UTILIZADO', 269.0, 646.0),
  t(':', 347.0, 646.0),
  t('0', 426.6, 646.0),
  t('clienta.ficticia@correo-ejemplo.cl', 20.0, 637.0),
  t('DISPONIBLE', 269.0, 634.0),
  t(':', 347.0, 634.0),
  t('750.000', 402.1, 634.0),
  t('VENCIMIENTO', 269.0, 622.0),
  t(':', 347.0, 622.0),
  t('INDEFINIDA', 385.2, 622.0),
  t('EJECUTIVO DE CUENTA', 20.0, 583.0),
  t(':', 128.0, 583.0),
  t('Ejecutiva Ficticia Ejemplo', 139.0, 583.0),
  t('N° DE CUENTA', 317.0, 583.0),
  t(':', 388.0, 583.0),
  t('98765432', 398.0, 583.0),
  t('MONEDA', 473.0, 583.0),
  t(':', 532.0, 583.0),
  t('PESOS', 542.0, 583.0),
  t('SUCURSAL', 20.0, 569.0),
  t(':', 128.0, 569.0),
  t('OFICINA FICTICIA EJEMPLO', 139.0, 569.0),
  t('CARTOLA N°', 317.0, 569.0),
  t(':', 388.0, 569.0),
  t('9', 398.0, 569.0),
  t('N° DE PAGINA', 473.0, 569.0),
  t(':', 532.0, 569.0),
  t('1 DE 1', 548.2, 569.0),
  t('TELEFONO', 20.0, 555.0),
  t(':', 128.0, 555.0),
  t('5620000000', 139.0, 555.0),
  t('DESDE', 317.0, 555.0),
  t(':', 388.0, 555.0),
  t('01/05/2026', 398.0, 555.0),
  t('HASTA', 473.0, 555.0),
  t(':', 532.0, 555.0),
  t('31/05/2026', 541.0, 555.0),
  // Encabezado de tabla (2 líneas físicas).
  t('FECHA', 20.7, 539.0),
  t('DETALLE DE TRANSACCION', 87.7, 539.0),
  t('SUCURSAL', 242.3, 539.0),
  t('N° DOCTO', 304.0, 539.0),
  t('MONTO CHEQUES', 353.7, 539.0),
  t('MONTO DEPOSITOS', 433.2, 539.0),
  t('SALDO', 539.0, 539.0),
  t('DIA/MES', 17.8, 530.0),
  t('O CARGOS', 367.7, 530.0),
  t('O ABONOS', 450.7, 530.0),
  // SALDO INICIAL: fila CON fecha cuyo único monto es el saldo.
  t('01/05', 23.0, 512.0),
  t('SALDO INICIAL', 58.0, 512.0),
  t('20.000.000', 548.5, 512.0),
  // Cargo ANCHO de 8 dígitos (x=392.5, fuera de la banda vieja por margen).
  t('02/05', 23.0, 502.0),
  t('INVERSION DEPOSITO FICTICIO', 58.0, 502.0),
  t('INTERNET', 232.0, 502.0),
  t('705', 316.0, 502.0),
  t('12.345.678', 392.5, 502.0),
  t('7.654.322', 551.9, 502.0),
  // Abono ANCHO de 8 dígitos en x≈472.6 (el bug real: fuera de [495,520)).
  t('03/05', 23.0, 492.0),
  t('TRASPASO DE:Contraparte Fict', 58.0, 492.0),
  t('INTERNET', 232.0, 492.0),
  t('15.000.000', 472.6, 492.0),
  t('22.654.322', 548.5, 492.0),
  // Abono MINIMO de 3 dígitos (x≈496.4 — dentro de la banda vieja: pinnea
  // que el rango completo [472, 503] queda en UNA sola banda).
  t('04/05', 23.0, 482.0),
  t('TRASPASO DE:Reembolso Fictic', 58.0, 482.0),
  t('INTERNET', 232.0, 482.0),
  t('500', 496.4, 482.0),
  t('22.654.822', 548.5, 482.0),
  // Abono mediano (x≈482.7, el caso de las filas que fallaban en prod).
  t('05/05', 23.0, 472.0),
  t('TRASPASO DE:Comercio Fictici', 58.0, 472.0),
  t('INTERNET', 232.0, 472.0),
  t('276.500', 482.7, 472.0),
  t('22.931.322', 548.5, 472.0),
  // Fila fechada SIN saldo corrido (patrón real de días con varios movs).
  t('06/05', 23.0, 462.0),
  t('CARGO SEGURO FICTICIO EJEMPL', 58.0, 462.0),
  t('CENTRAL', 232.0, 462.0),
  t('45.300', 406.1, 462.0),
  // Cargo de 1 dígito en x=423.1 (inicio máximo observado en las 16).
  t('06/05', 23.0, 452.0),
  t('COMISION AJUSTE FICTICIO', 58.0, 452.0),
  t('CENTRAL', 232.0, 452.0),
  t('7', 423.1, 452.0),
  t('22.886.015', 548.5, 452.0),
  t('07/05', 23.0, 442.0),
  t('TRASPASO A:Proveedora Fictic', 58.0, 442.0),
  t('INTERNET', 232.0, 442.0),
  t('890.123', 402.7, 442.0),
  t('21.995.892', 548.5, 442.0),
  // SALDO FINAL: misma forma que SALDO INICIAL.
  t('31/05', 23.0, 432.0),
  t('SALDO FINAL', 58.0, 432.0),
  t('21.995.892', 548.5, 432.0),
  // Resumen sin fecha: ecuación de totales del período.
  t('DEPOSITOS', 43.2, 126.0),
  t('CHEQUES', 138.7, 126.0),
  t('OTROS ABONOS', 219.6, 126.0),
  t('OTROS CARGOS', 310.6, 126.0),
  t('GIROS CAJERO AUTOMATICO', 394.1, 126.0),
  t('IMPUESTOS', 532.4, 126.0),
  t('0', 101.5, 109.0),
  t('0', 198.6, 109.0),
  t('15.277.000', 254.0, 109.0),
  t('13.281.108', 347.0, 109.0),
  t('0', 502.6, 109.0),
  t('0', 585.5, 109.0),
  // Resumen sin fecha: retenciones + saldo disponible (valor ancho en
  // x=543.4 — DEBE quedar fuera de la banda abono).
  t('RETENCION A 1 DIA', 63.6, 166.0),
  t('RETENCION A MAS DE 1 DIA', 271.9, 166.0),
  t('SALDO DISPONIBLE A LA FECHA', 448.6, 166.0),
  t('0', 134.6, 147.0),
  t('0', 379.6, 147.0),
  t('21.995.892', 543.4, 147.0),
];

// ---------------------------------------------------------------------------
// Ensamblado del PDF (xref con offsets exactos, streams sin comprimir).
// ---------------------------------------------------------------------------

function generar(): Buffer {
  const paginas = [pagina1];
  // Objetos: 1 catálogo, 2 pages, 3 page, 4 contents, 5-6 fuentes (dos
  // Helvetica idénticas — ver contenidoPagina del generador BCI).
  const objetos: string[] = [];
  objetos.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objetos.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  objetos.push(
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n',
  );
  const stream = contenidoPagina(paginas[0]);
  const largo = Buffer.byteLength(stream, 'latin1');
  objetos.push(
    `4 0 obj\n<< /Length ${largo} >>\nstream\n${stream}\nendstream\nendobj\n`,
  );
  objetos.push(
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n',
  );
  objetos.push(
    '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n',
  );

  let cuerpo = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const objeto of objetos) {
    offsets.push(Buffer.byteLength(cuerpo, 'latin1'));
    cuerpo += objeto;
  }
  const inicioXref = Buffer.byteLength(cuerpo, 'latin1');
  let xref = `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    xref += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;
  return Buffer.from(cuerpo + xref + trailer, 'latin1');
}

const destino = join(__dirname, 'bancochile-cartola-montos-grandes-test.pdf');
writeFileSync(destino, generar());

console.log(`fixture generado: ${destino}`);
