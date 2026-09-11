/**
 * Generador del fixture `bci-cartola-variante-test.pdf` — segunda cartola
 * BCI (Slice 1, change SDD `bci-cartola-variante`), 100% SINTÉTICA (persona,
 * cuenta, comercios y montos ficticios) que reproduce la GEOMETRÍA medida
 * contra una cartola real distinta a la que calibró `rangosX` el
 * 2026-08-30 (ver docblock de `BciPdfStrategy`) — la misma entidad bancaria
 * imprime dos layouts publicados. Solo la posición X de cada columna cruza
 * desde el archivo real: ningún nombre, comercio, cuenta o monto de ese
 * archivo aparece aquí (ver design.md D-12, PII boundary).
 *
 * Geometría que este generador DEBE reproducir (design.md D-12):
 *   - Fechas de fila `DD-MM-YYYY` (guion, no slash), x = 33.6 — fuera de la
 *     banda `fecha` ACTUAL [35, 85) (`t.x >= xMin`, `token-grouping.ts:112`):
 *     esta cartola es la prueba de que el fix de separador (D-04) por sí
 *     solo no basta, la banda también debe ensancharse (D-02/D-03).
 *   - Columna `SUCURSAL`, x ∈ [75.7, 83.4] — columna que la V1 no modela.
 *   - `descripcion` arrancando en 134.8, extendida hasta ≈220.7.
 *   - Cargos, alineados a la derecha, x ∈ [420.9, 434.1] — incluye un token
 *     ≥430 (hoy en la zona muerta [430,435) de la V1).
 *   - Abonos, x ∈ [484.4, 486.6] — banda angosta (solo 2 muestras reales),
 *     con al menos dos depósitos en este fixture para poder probarla.
 *   - Saldo corrido, x ∈ [555.9, 570.6] — debe quedar SIN asignar bajo
 *     cualquier configuración de `rangosX` de este change.
 *   - Encabezado de tabla de UNA sola línea física (a diferencia de la V1,
 *     que usa 3), repetido en cada una de las 3 páginas: `FECHA` 38.2,
 *     `SUCURSAL` 81.1, `DESCRIPCION` 195.9, `CHEQUES` 392.1, `DEPOSITOS`
 *     459.9, `SALDO DIARIO` 521.2.
 *   - Ancla de período partida en TRES tokens físicos — `PERIODO` | `:` |
 *     `DD-MM-YYYY al DD-MM-YYYY` — a diferencia de la V1, que trae ambas
 *     fechas dentro de un único token de valor.
 *   - 3 páginas.
 *
 * Este fixture NO PARSEA todavía — es esperado y correcto (Slice 1 no toca
 * `src/`). Los slices 2 y 3 lo hacen parsear. Este generador y su fixture
 * solo se auto-verifican geométricamente (ver el describe `fixture
 * geometry` en `bci.strategy.spec.ts`).
 *
 * AMENDMENT A-01 (Slice 3b, Phase 42, 2026-09-10) — 3 cargos NUEVOS, cortos
 * (1/2/3 dígitos, SIN separador de miles): esta es la brecha que dejó pasar
 * un parser roto en producción — el fixture original no tenía montos
 * <1.000, así que nunca ejercitó el dead zone [440,450) con un monto real
 * corto. Los 3 nuevos `x` se calculan con `x = CONVERGENCIA_BORDE_DERECHO -
 * anchoEstimado(texto, 6)` — la MISMA tabla de advances que
 * `token-grouping.ts` usa en producción (importada, no copiada a mano) —
 * para que el fixture PRUEBE el estimador en vez de solo coexistir con él.
 * `CONVERGENCIA_BORDE_DERECHO = 449.08` reproduce la convergencia medida en
 * el statement real (design.md AMENDMENT A-01, spread 0.01pt entre largos
 * de token). Resultado: el cargo de 1 dígito y el de 2 dígitos caen en el
 * catchment [440,450) (la falla real de producción); el de 3 dígitos cae en
 * [437.6,440), reproduciendo los 11 montos cortos que ya funcionaban bajo
 * las bandas que Slice 3 dejó publicadas.
 *
 * Saldo: el generador calcula un saldo corrido internamente consistente por
 * construcción (mismo precedente que
 * `generar-bci-cartola-montos-grandes-test.ts:80-83`) y expone
 * `SALDO_ANTERIOR`/`TOTAL_CARGOS`/`TOTAL_ABONOS`/`SALDO_FINAL` como
 * constantes con nombre para que un slice futuro pueda afirmar la identidad
 * de reconciliación `saldoAnterior − Σcargo + Σabono === saldoFinal`
 * (design.md D-13) sin volver a sumar montos a mano.
 *
 * PDF crudo, sin dependencias: content streams SIN comprimir con operadores
 * de texto BT/Tf/Tm/Tj/ET — pdfjs-dist reporta el x/y de cada token tal
 * cual el Tm que lo posiciona, así que la geometría queda pinneada al
 * punto. La fuente es Helvetica con /WinAnsiEncoding y el archivo se
 * escribe en latin1. Reutiliza el truco del salto de pluma hacia atrás en
 * x=599 (ver `contenidoPagina`, mismo mecanismo que
 * `generar-bci-cartola-montos-grandes-test.ts:59-77`) para que pdfjs nunca
 * fusione dos tokens consecutivos en uno solo.
 *
 * Regenerar (desde apps/api):
 *   pnpm exec tsx test/fixtures/pdf/generar-bci-cartola-variante-test.ts
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { anchoEstimado } from '../../../src/infrastructure/pdf/token-grouping';

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
  // Mismo truco que generar-bci-cartola-montos-grandes-test.ts:59-77: pdfjs
  // fusiona runs de texto consecutivos de la misma línea en un solo item.
  // Un salto de pluma HACIA ATRÁS (espacio en x=599, fuera de toda banda)
  // corta el item siempre, así que el siguiente token real queda a la
  // izquierda del pen y pdfjs lo abre como item nuevo con su x/y exactos.
  const lineas = tokens.map(
    (tok) =>
      `BT /F1 9 Tf 1 0 0 1 ${tok.x.toFixed(1)} ${tok.y.toFixed(1)} Tm (${escaparPdf(tok.str)}) Tj ET\n` +
      `BT /F1 9 Tf 1 0 0 1 599.0 ${tok.y.toFixed(1)} Tm ( ) Tj ET`,
  );
  return lineas.join('\n');
}

// ---------------------------------------------------------------------------
// Saldo — calculado por construcción, no impreso como sección de totales
// (D-12 no lo exige para esta cartola). saldoAnterior − Σcargo + Σabono
// debe cuadrar exacto con el saldo corrido de la última fila (verificado
// abajo, en el bloque de aserción de consistencia).
// ---------------------------------------------------------------------------

export const SALDO_ANTERIOR = 8_000_000;

// AMENDMENT A-01 (design.md, "Fixture obligation") — convergencia medida en
// el statement real: el borde DERECHO estimado de un monto right-aligned
// converge a este valor sin importar cuántos dígitos tenga (spread 0.01pt).
// Usada para calcular, no adivinar, el `x` de los 3 cargos cortos nuevos.
const CONVERGENCIA_BORDE_DERECHO = 449.08;

/** `x` right-aligned por construcción: borde derecho fijo, borde izquierdo derivado. */
function xRescatado(texto: string): number {
  const ancho = anchoEstimado(texto, 6);
  if (ancho === null) {
    throw new Error(`texto no medible por anchoEstimado: "${texto}"`);
  }
  return CONVERGENCIA_BORDE_DERECHO - ancho;
}

interface MovimientoPlan {
  readonly fecha: string;
  readonly sucursal: string;
  readonly sucursalX: number;
  readonly descripcion: string;
  readonly cargo?: { texto: string; x: number };
  readonly abono?: { texto: string; x: number };
}

// Los x de cargo/abono/saldo fueron elegidos para cubrir los extremos
// medidos del contrato D-12 (33.6 / 420.9 / 434.1 / 484.4 / 486.6 / 555.9 /
// 570.6) al menos una vez cada uno a lo largo del fixture.
//
// `sucursalX` se mantiene deliberadamente dentro de [75.7, 77.8] — un
// SUBRANGO seguro del contrato [75.7, 83.4] — en vez de recorrer todo el
// ancho medido. Motivo (empírico, verificado contra pdfjs-dist@6.2.108):
// el extractor decide fusionar dos tokens consecutivos de la MISMA línea
// SOLO comparando la posición real de sus glifos (ignora el espaciador de
// x=599 — los caracteres whitespace nunca pasan por `compareWithLastPosition`,
// así que el "salto de pluma hacia atrás" no protege este caso). El token
// `fecha` ("DD-MM-YYYY", Helvetica 9pt) termina en x≈79.6 — CUALQUIER
// `sucursalX` en (77.8, 85.0) cae en la "zona de fusión" de pdfjs y se
// pega al string de la fecha SIN separador (`"05-06-2026601"`), lo que
// rompe el token de fecha que el resto de este change necesita aislado.
// `sucursalX <= 77.8` fuerza un salto hacia atrás (`advanceX < -1.8`) que
// SIEMPRE corta en un ítem nuevo.
const movimientosPlan: readonly MovimientoPlan[] = [
  {
    fecha: '05-06-2026',
    sucursal: '601',
    sucursalX: 76.2,
    descripcion: 'COMPRA FICTICIA UNO',
    cargo: { texto: '45.000', x: 428.0 },
  },
  {
    fecha: '06-06-2026',
    sucursal: '601',
    sucursalX: 76.7,
    descripcion: 'COMPRA FICTICIA DOS',
    cargo: { texto: '120.500', x: 425.0 },
  },
  {
    fecha: '07-06-2026',
    sucursal: '715',
    sucursalX: 76.0,
    descripcion: 'PAGO SERVICIO FICTICIO',
    cargo: { texto: '89.990', x: 428.5 },
  },
  {
    fecha: '08-06-2026',
    sucursal: '715',
    sucursalX: 76.0,
    descripcion: 'TRANSFERENCIA RECIBIDA FICTICIA',
    abono: { texto: '250.000', x: 485.0 },
  },
  {
    fecha: '09-06-2026',
    sucursal: '820',
    sucursalX: 77.2,
    descripcion: 'COMPRA FICTICIA TRES',
    // x >= 430: dentro de la zona muerta de la V1 [430, 435).
    cargo: { texto: '15.300', x: 430.5 },
  },
  {
    fecha: '10-06-2026',
    sucursal: '820',
    sucursalX: 77.2,
    descripcion: 'DEPOSITO FICTICIO DOS',
    abono: { texto: '180.000', x: 484.4 }, // extremo inferior de la banda abono
  },
  {
    fecha: '11-06-2026',
    sucursal: '601',
    sucursalX: 76.2,
    descripcion: 'COMPRA FICTICIA CUATRO',
    cargo: { texto: '67.000', x: 427.0 },
  },
  {
    fecha: '12-06-2026',
    sucursal: '601',
    sucursalX: 76.7,
    descripcion: 'COMPRA FICTICIA CINCO ANCHA',
    // Monto ancho (7 dígitos): x más a la izquierda = extremo inferior de
    // la banda cargo.
    cargo: { texto: '1.234.567', x: 420.9 },
  },
  {
    fecha: '13-06-2026',
    sucursal: '715',
    sucursalX: 75.7, // extremo inferior de la banda SUCURSAL
    descripcion: 'PAGO FICTICIO SEIS',
    cargo: { texto: '4.300', x: 432.0 },
  },
  {
    fecha: '14-06-2026',
    sucursal: '820',
    sucursalX: 77.5,
    descripcion: 'DEPOSITO FICTICIO TRES',
    abono: { texto: '56.000', x: 486.6 }, // extremo superior de la banda abono
  },
  {
    fecha: '15-06-2026',
    sucursal: '601',
    sucursalX: 76.2,
    descripcion: 'COMPRA FICTICIA SIETE',
    // Monto angosto (3 dígitos): x más a la derecha = extremo superior de
    // la banda cargo.
    cargo: { texto: '999', x: 434.1 },
  },
  // AMENDMENT A-01 (Phase 42) — 3 cargos NUEVOS, cortos, SIN separador de
  // miles, alineados a la derecha POR CONSTRUCCIÓN vía `xRescatado` (misma
  // tabla de advances que produccion). Los 3 reproducen exactamente la fila
  // "token length" de la tabla de convergencia de design.md AMENDMENT A-01.
  {
    fecha: '16-06-2026',
    sucursal: '601',
    sucursalX: 76.2,
    descripcion: 'COMPRA FICTICIA OCHO MONTO CORTO',
    // 1 dígito -> x ~= 445.74, dentro del catchment [440,450): la falla
    // real de producción que este amendment rescata.
    cargo: { texto: '5', x: xRescatado('5') },
  },
  {
    fecha: '17-06-2026',
    sucursal: '715',
    sucursalX: 76.0,
    descripcion: 'COMPRA FICTICIA NUEVE MONTO CORTO',
    // 2 dígitos -> x ~= 442.41, dentro del catchment [440,450).
    cargo: { texto: '42', x: xRescatado('42') },
  },
  {
    fecha: '18-06-2026',
    sucursal: '820',
    sucursalX: 77.2,
    descripcion: 'COMPRA FICTICIA DIEZ MONTO CORTO',
    // 3 dígitos -> x ~= 439.07, dentro de [437.6,440): reproduce los 11
    // montos cortos que YA funcionaban bajo las bandas shippeadas en
    // Slice 3 (clasificados por borde izquierdo, sin necesitar rescate).
    cargo: { texto: '756', x: xRescatado('756') },
  },
];

function montoAEntero(texto: string): number {
  return Number(texto.replace(/\./g, ''));
}

export const TOTAL_CARGOS = movimientosPlan.reduce(
  (acc, m) => acc + (m.cargo ? montoAEntero(m.cargo.texto) : 0),
  0,
);
export const TOTAL_ABONOS = movimientosPlan.reduce(
  (acc, m) => acc + (m.abono ? montoAEntero(m.abono.texto) : 0),
  0,
);
export const SALDO_FINAL = SALDO_ANTERIOR - TOTAL_CARGOS + TOTAL_ABONOS;

// Los x de la columna "saldo corrido" (555.9 – 570.6) son puramente
// geométricos — no hace falta que crezcan monótonamente con el saldo, solo
// que caigan dentro de la banda medida.
const saldoX = [
  560.0, 558.0, 559.0, 557.5, 560.5, 561.0, 559.5, 555.9, 562.0, 563.0, 570.6,
  556.5, 565.0, 560.0,
];

let saldoCorriendo = SALDO_ANTERIOR;
const saldosCorridos: number[] = movimientosPlan.map((m) => {
  saldoCorriendo =
    saldoCorriendo -
    (m.cargo ? montoAEntero(m.cargo.texto) : 0) +
    (m.abono ? montoAEntero(m.abono.texto) : 0);
  return saldoCorriendo;
});

// Consistencia por construcción (D-13): el saldo corrido de la última fila
// debe cuadrar exacto con SALDO_FINAL.
if (saldosCorridos[saldosCorridos.length - 1] !== SALDO_FINAL) {
  throw new Error(
    `saldo corrido inconsistente: última fila=${saldosCorridos[saldosCorridos.length - 1]}, SALDO_FINAL=${SALDO_FINAL}`,
  );
}

/** Formatea con separador de miles "." (estilo CLP), sin depender de ICU/locale. */
function formatearMiles(valor: number): string {
  return Math.trunc(valor)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// ---------------------------------------------------------------------------
// Tokens por página.
// ---------------------------------------------------------------------------

const encabezadoTabla = (y: number): TokenPdf[] => [
  t('FECHA', 38.2, y),
  t('SUCURSAL', 81.1, y),
  t('DESCRIPCION', 195.9, y),
  t('CHEQUES', 392.1, y),
  t('DEPOSITOS', 459.9, y),
  t('SALDO DIARIO', 521.2, y),
];

function filaMovimiento(
  plan: MovimientoPlan,
  y: number,
  saldo: number,
): TokenPdf[] {
  const fila: TokenPdf[] = [
    t(plan.fecha, 33.6, y),
    t(plan.sucursal, plan.sucursalX, y),
    t(plan.descripcion, 134.8, y),
  ];
  if (plan.cargo) fila.push(t(plan.cargo.texto, plan.cargo.x, y));
  if (plan.abono) fila.push(t(plan.abono.texto, plan.abono.x, y));
  fila.push(
    t(formatearMiles(saldo), saldoX[movimientosPlan.indexOf(plan)] ?? 560.0, y),
  );
  return fila;
}

const pagina1: TokenPdf[] = [
  t('BCI- CARTOLA DE CUENTA CORRIENTE', 28.0, 780.0),
  t('CARTOLA DE CUENTA CORRIENTE', 193.8, 742.5),
  t('CARTOLA N°', 456.5, 742.5),
  t('9', 556.7, 742.5),
  t('Sr(a)', 201.8, 714.0),
  t('CLIENTE FICTICIO VARIANTE', 220.5, 714.0),
  t('N° CUENTA', 414.4, 714.0),
  t('11223344', 463.3, 714.0),
  t('MONEDA', 503.3, 714.0),
  t('PESOS', 542.8, 714.0),
  t('OFICINA:', 414.4, 684.8),
  t('SUCURSAL FICTICIA DOS', 459.0, 684.8),
  t('CLIENTE.VARIANTE@CORREO-EJEMPLO.CL', 148.9, 657.8),
  // Ancla de período partida en 3 tokens físicos (a diferencia de la V1,
  // que trae ambas fechas en un único token de valor) — design.md D-06.
  // El salto de ":" a la fecha se eligió >5.4pt (ver nota sobre la "zona
  // de fusión" de pdfjs más abajo, junto a `movimientosPlan`) para que
  // ambos queden como ítems separados en vez de fusionarse en un string.
  t('PERIODO', 414.4, 630.0),
  t(':', 452.0, 630.0),
  t('01-06-2026 al 30-06-2026', 465.0, 630.0),
  ...encabezadoTabla(600.0),
  ...filaMovimiento(movimientosPlan[0], 580.0, saldosCorridos[0]),
  ...filaMovimiento(movimientosPlan[1], 566.0, saldosCorridos[1]),
  ...filaMovimiento(movimientosPlan[2], 552.0, saldosCorridos[2]),
  ...filaMovimiento(movimientosPlan[3], 538.0, saldosCorridos[3]),
];

const pagina2: TokenPdf[] = [
  t('CARTOLA DE CUENTA CORRIENTE', 193.8, 770.0),
  ...encabezadoTabla(754.5),
  ...filaMovimiento(movimientosPlan[4], 734.5, saldosCorridos[4]),
  ...filaMovimiento(movimientosPlan[5], 720.5, saldosCorridos[5]),
  ...filaMovimiento(movimientosPlan[6], 706.5, saldosCorridos[6]),
  ...filaMovimiento(movimientosPlan[7], 692.5, saldosCorridos[7]),
];

const pagina3: TokenPdf[] = [
  t('CARTOLA DE CUENTA CORRIENTE', 193.8, 770.0),
  ...encabezadoTabla(754.5),
  ...filaMovimiento(movimientosPlan[8], 734.5, saldosCorridos[8]),
  ...filaMovimiento(movimientosPlan[9], 720.5, saldosCorridos[9]),
  ...filaMovimiento(movimientosPlan[10], 706.5, saldosCorridos[10]),
  // AMENDMENT A-01 (Phase 42) — 3 filas nuevas, cargos cortos.
  ...filaMovimiento(movimientosPlan[11], 692.5, saldosCorridos[11]),
  ...filaMovimiento(movimientosPlan[12], 678.5, saldosCorridos[12]),
  ...filaMovimiento(movimientosPlan[13], 664.5, saldosCorridos[13]),
];

// ---------------------------------------------------------------------------
// Ensamblado del PDF (xref con offsets exactos, streams sin comprimir).
// ---------------------------------------------------------------------------

function generar(): Buffer {
  const paginas = [pagina1, pagina2, pagina3];
  // Objetos: 1 catálogo, 2 pages, 3-5 page, 6-8 contents, 9 fuente.
  const objetos: string[] = [];
  objetos.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objetos.push(
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>\nendobj\n',
  );
  paginas.forEach((_, i) => {
    objetos.push(
      `${3 + i} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${6 + i} 0 R /Resources << /Font << /F1 9 0 R >> >> >>\nendobj\n`,
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

const destino = join(__dirname, 'bci-cartola-variante-test.pdf');
writeFileSync(destino, generar());

console.log(`fixture generado: ${destino}`);
console.log(
  `saldo: anterior=${SALDO_ANTERIOR} cargos=${TOTAL_CARGOS} abonos=${TOTAL_ABONOS} final=${SALDO_FINAL}`,
);
