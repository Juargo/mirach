/**
 * Generador del fixture `bci-cartola-montos-grandes-test.pdf` — cartola BCI
 * 100% SINTÉTICA (persona, cuenta, comercios y montos ficticios) que replica
 * la geometría medida contra 15 cartolas reales (2026-08-30, ver docblock de
 * `BciPdfStrategy`) para pinnear la recalibración de `rangosX` y los casos
 * duros que el fixture original (`bci-cartola-test.pdf`, montos chicos) no
 * cubría:
 *
 *   - Cargo ANCHO de 8 dígitos ("11.200.000") arrancando en x≈381 — las
 *     columnas de monto están alineadas a la derecha, así que el x de inicio
 *     corre hacia la izquierda con el ancho del monto (bug real: la banda
 *     original [395, 420) lo perdía y cada fila fallaba con
 *     `TokenSinAsignarSospechoso`).
 *   - Abono ancho ("1.850.000") arrancando en x≈459.3 — 0.7pt fuera de la
 *     banda original [460, 500).
 *   - Fila $0 con "0" LITERAL en la columna cargos ("VERIFICACION DE
 *     CUENTA") y saldo corrido NEGATIVO fuera de banda — se descarta como
 *     no-movimiento en vez de reventar el invariante cargo XOR abono.
 *   - Cluster de continuación multilínea (etiqueta ARRIBA + N° de documento
 *     desbordado en `descripcion` + cuota ABAJO), igual que el fixture
 *     original.
 *   - Sección de totales de la última página, incluida la fila de etiquetas
 *     "Periodo  Saldo Anterior" (el leak de `fusionarContinuaciones` que
 *     motivó su guard en `filasIgnoradas`) y las filas de valores/ecuación.
 *   - Encabezado de tabla de 3 líneas físicas repetido por página, título
 *     reimpreso, línea de sobregiro y footer de navegador (URL + timestamp +
 *     indicador de página).
 *
 * PDF crudo, sin dependencias: content streams SIN comprimir con operadores
 * de texto BT/Tf/Td/Tj — pdfjs-dist reporta el x/y de cada token tal cual el
 * Td que lo posiciona, así que la geometría queda pinneada al punto. La
 * fuente es Helvetica con /WinAnsiEncoding y el archivo se escribe en
 * latin1, de modo que "°" (0xB0) sobrevive el round-trip de extracción.
 *
 * Regenerar (desde apps/api):
 *   pnpm exec tsx test/fixtures/pdf/generar-bci-cartola-montos-grandes-test.ts
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
  // pdfjs FUSIONA runs de texto consecutivos de la misma línea en un solo
  // item (rellenando el gap con espacios falsos) — eso corrompería la
  // geometría del fixture: dos columnas quedarían como UN token con el x de
  // la primera. Un salto de pluma HACIA ATRÁS sí corta el item siempre, así
  // que tras cada token real se emite un run "espaciador" (un espacio en
  // x=599, fuera de toda banda de columna) — el siguiente token real queda
  // entonces a la izquierda del pen y pdfjs lo abre como item nuevo con su
  // x/y exactos. El espaciador es whitespace puro: si pdfjs lo fusiona con
  // el token anterior solo agrega espacios al final del str (los joins de
  // columnas y parsearMontoPdf los ignoran), y si sale como token propio
  // queda sin asignar en x=599, invisible para el normalizador.
  const lineas = tokens.map(
    (tok) =>
      `BT /F1 9 Tf 1 0 0 1 ${tok.x.toFixed(1)} ${tok.y.toFixed(1)} Tm (${escaparPdf(tok.str)}) Tj ET\n` +
      `BT /F1 9 Tf 1 0 0 1 599.0 ${tok.y.toFixed(1)} Tm ( ) Tj ET`,
  );
  return lineas.join('\n');
}

// ---------------------------------------------------------------------------
// Contenido sintético. Saldo anterior 15.000.000; el saldo corrido de cada
// fila y los totales de la última página cuadran exactos:
//   cargos 11.654.280 · abonos 1.895.320 · saldo final 5.241.040.
// ---------------------------------------------------------------------------

const encabezadoTabla = (yTop: number): TokenPdf[] => [
  t('CHEQUES Y', 361.4, yTop),
  t('N° DE', 310.1, yTop - 10.5),
  t('OTROS', 372.0, yTop - 10.5),
  t('DEPOSITOS', 433.4, yTop - 10.5),
  t('FECHA', 47.3, yTop - 21),
  t('SUCURSAL', 98.6, yTop - 21),
  t('DESCRIPCION', 189.7, yTop - 21),
  t('DOCUMENTO', 293.0, yTop - 21),
  t('CARGOS', 368.1, yTop - 21),
  t('Y ABONOS', 435.8, yTop - 21),
  t('SALDO DIARIO', 507.6, yTop - 21),
];

const footerNavegador = (pagina: string): TokenPdf[] => [
  t('https://www.bci.cl/personas/cartola-ficticia', 28.0, 20.0),
  t('5/05/26, 10:15 AM', 28.0, 12.0),
  t(pagina, 566.0, 12.0),
];

const pagina1: TokenPdf[] = [
  // Título de navegador (ancla "BCI" + "CARTOLA DE CUENTA CORRIENTE").
  t('BCI- CARTOLA DE CUENTA CORRIENTE', 28.0, 780.0),
  t('CARTOLA DE CUENTA CORRIENTE', 193.8, 742.5),
  t('CARTOLA N°', 456.5, 742.5),
  t('7', 556.7, 742.5),
  t('Sr(a)', 201.8, 714.0),
  t('CLIENTE FICTICIO EJEMPLO', 220.5, 714.0),
  t('N° CUENTA', 414.4, 714.0),
  t('87654321', 463.3, 714.0),
  t('MONEDA', 503.3, 714.0),
  t('PESOS', 542.8, 714.0),
  t('OFICINA:', 414.4, 684.8),
  t('SUCURSAL FICTICIA', 459.0, 684.8),
  t('CLIENTE.FICTICIO@CORREO-EJEMPLO.CL', 148.9, 657.8),
  t('PERIODO', 414.4, 630.0),
  t('01-05-2026 al 31-05-2026', 460.0, 630.0),
  // Texto legal decorativo con letter-spacing (igual que las cartolas reales).
  t('E S T A D O', 203.8, 609.0),
  t('D E', 246.0, 609.0),
  t('C U E N TA', 264.0, 609.0),
  t('L I N E A', 305.0, 609.0),
  t('D E', 338.5, 609.0),
  t('S O B R E G I R O', 357.0, 609.0),
  t('MONTO LINEA DE SOBREGIRO:', 28.5, 599.3),
  t('1.500.000', 123.4, 599.3),
  t('MONTO UTILIZADO:', 194.8, 599.3),
  t('0', 254.9, 599.3),
  t('MONTO DISPONIBLE:', 344.9, 599.3),
  t('1.500.000', 409.7, 599.3),
  t('VENCIMIENTO:', 483.8, 599.3),
  t('20-01-2027', 529.9, 599.3),
  ...encabezadoTabla(579.0),
  // Movimientos (saldo corrido exacto).
  t('02/05/2026', 43.4, 546.0),
  t('UGCA AUT', 98.6, 546.0),
  t('COMPRA FERRETERIA EJEMPLO 445566', 151.2, 546.0),
  t('445566', 309.0, 546.0),
  t('14.990', 395.7, 546.0),
  t('14.985.010', 542.6, 546.0),
  t('02/05/2026', 43.4, 534.8),
  t('UGCA AUT', 98.6, 534.8),
  t('PAGO SUSCRIPCION REVISTA 778899', 151.2, 534.8),
  t('778899', 309.0, 534.8),
  t('890', 404.5, 534.8),
  t('14.984.120', 542.6, 534.8),
  // Fila $0 (cargo "0" literal, no mueve el saldo).
  t('03/05/2026', 43.4, 523.5),
  t('UGCA AUT', 98.6, 523.5),
  t('VERIFICACION DE CUENTA', 151.2, 523.5),
  t('555001', 308.3, 523.5),
  t('0', 412.8, 523.5),
  t('14.984.120', 542.6, 523.5),
  // Cluster de continuación: etiqueta ARRIBA, documento desbordado, cuota ABAJO.
  t('PAGO CREDITO D07700445566', 151.2, 512.3),
  t('03/05/2026', 43.4, 508.0),
  t('APOQUINDO', 98.6, 508.0),
  t('7700445566', 301.0, 508.0),
  t('310.550', 391.5, 508.0),
  t('14.673.570', 542.6, 508.0),
  t('004/024', 151.2, 503.8),
  // Cargo ANCHO: 8 dígitos arrancando en x=381.1 (el bug original).
  t('04/05/2026', 43.4, 492.8),
  t('OF CENTRA', 98.6, 492.8),
  t('INVERSION DEPOSITO PLAZO FIJO', 151.2, 492.8),
  t('812', 316.0, 492.8),
  t('11.200.000', 381.1, 492.8),
  t('3.473.570', 546.7, 492.8),
  ...footerNavegador('1/3'),
];

const pagina2: TokenPdf[] = [
  t('CARTOLA DE CUENTA CORRIENTE', 193.8, 770.0),
  ...encabezadoTabla(754.5),
  // Abono ancho arrancando en x=459.3 (0.7pt fuera de la banda original).
  t('05/05/2026', 43.4, 721.5),
  t('OF VIRT U', 98.6, 721.5),
  t('TRANSFERENCIA DE TERCERO FICTICIO', 151.2, 721.5),
  t('556677', 309.0, 721.5),
  t('1.850.000', 459.3, 721.5),
  t('5.323.570', 546.7, 721.5),
  t('05/05/2026', 43.4, 710.3),
  t('UGCA AUT', 98.6, 710.3),
  t('COMPRA PANADERIA EJEMPLO 998877', 151.2, 710.3),
  t('998877', 307.7, 710.3),
  t('7.850', 399.9, 710.3),
  t('5.315.720', 546.7, 710.3),
  t('06/05/2026', 43.4, 699.0),
  t('OF CENTRA', 98.6, 699.0),
  t('ABONO REEMBOLSO SEGURO FICTICIO', 151.2, 699.0),
  t('665544', 309.0, 699.0),
  t('45.320', 469.7, 699.0),
  t('5.361.040', 546.7, 699.0),
  ...footerNavegador('2/3'),
];

const pagina3: TokenPdf[] = [
  t('CARTOLA DE CUENTA CORRIENTE', 193.8, 770.0),
  ...encabezadoTabla(754.5),
  t('06/05/2026', 43.4, 721.5),
  t('UGCA AUT', 98.6, 721.5),
  t('GIRO CAJERO EJEMPLO', 151.2, 721.5),
  t('111222', 309.0, 721.5),
  t('120.000', 391.5, 721.5),
  t('5.241.040', 546.7, 721.5),
  // Sección de totales — la fila "Periodo  Saldo Anterior" es el leak que
  // motivó su guard en filasIgnoradas (fila sin fecha ni montos propios).
  t('Total Cargos y', 362.7, 585.8),
  t('Total Abonos y', 434.1, 585.8),
  t('Saldo Contable Final', 504.2, 585.8),
  t('Periodo', 49.4, 582.0),
  t('Saldo Anterior', 298.0, 582.0),
  t('Cheques', 371.7, 577.5),
  t('Depositos', 441.8, 577.5),
  // Fila de valores (ecuación): protegida sola — trae montos en banda cargo.
  t('01-05-2026 al 31-05-2026', 45.0, 561.8),
  t('15.000.000', 296.0, 561.8),
  t('-', 355.3, 561.8),
  t('11.654.280', 386.0, 561.8),
  t('+', 431.7, 561.8),
  t('1.895.320', 461.0, 561.8),
  t('=', 510.0, 561.8),
  t('5.241.040', 538.0, 561.8),
  t('Retenciones', 147.0, 521.3),
  t('Saldo Disponible', 383.7, 521.3),
  t('0', 165.8, 510.0),
  t('5.241.040', 400.4, 510.0),
  ...footerNavegador('3/3'),
];

// ---------------------------------------------------------------------------
// Ensamblado del PDF (xref con offsets exactos, streams sin comprimir).
// ---------------------------------------------------------------------------

function generar(): Buffer {
  const paginas = [pagina1, pagina2, pagina3];
  // Objetos: 1 catálogo, 2 pages, 3-5 page, 6-8 contents, 9-10 fuentes
  // (dos Helvetica idénticas — ver contenidoPagina).
  const objetos: string[] = [];
  objetos.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objetos.push(
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>\nendobj\n',
  );
  paginas.forEach((_, i) => {
    objetos.push(
      `${3 + i} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${6 + i} 0 R /Resources << /Font << /F1 9 0 R /F2 10 0 R >> >> >>\nendobj\n`,
    );
  });
  paginas.forEach((pagina, i) => {
    const stream = contenidoPagina(pagina);
    const largo = Buffer.byteLength(stream, 'latin1');
    objetos.push(
      `${6 + i} 0 obj\n<< /Length ${largo} >>\nstream\n${stream}\nendstream\nendobj\n`,
    );
  });
  objetos.push(
    '9 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n',
  );
  objetos.push(
    '10 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n',
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

const destino = join(__dirname, 'bci-cartola-montos-grandes-test.pdf');
writeFileSync(destino, generar());

console.log(`fixture generado: ${destino}`);
