import { PagedTokens } from './pdf-text-extractor';
import { agruparTokens, RangoColumna } from './token-grouping';
import {
  EstructuraPdfBanco,
  FormatoFechaPdf,
} from './strategies/estructura-pdf-banco';
import { parsearMontoPdf } from './parse-monto';
import { inferirAnios } from '../../application/services/inferir-anio';
import { Transaccion } from '../../domain/value-objects/transaccion';

interface FechaFilaParseada {
  readonly dia: number;
  readonly mes: number;
  /** Presente solo si el formato trae el año explícito por fila (BCI, 'DD/MM/YYYY'). */
  readonly anio: number | undefined;
}

/**
 * Extrae día/mes(/año) de la columna `fecha` de una fila ya agrupada.
 *
 * El match NO está anclado al inicio del string a propósito: Santander
 * fusiona fecha+sucursal en un solo token PDF (ej. "05/03 Providencia") — un
 * regex que busca el patrón DD/MM en cualquier posición del texto extrae la
 * fecha sin necesitar un caso especial por banco (design.md decisión #4: la
 * geometría de columnas ya resuelve el problema, no hace falta lógica ad-hoc
 * de Santander en el núcleo de normalización).
 *
 * 'DD/Mmm' (BancoEstado, mes en español abreviado) queda sin implementar a
 * propósito — PR4b. Nunca lanza: formato desconocido o texto sin match →
 * `null` (fila descartada por el caller; este módulo no tiene taxonomía de
 * error por fila, ver parse-monto.ts).
 */
function parsearFechaFila(
  valorColumnaFecha: string,
  formato: FormatoFechaPdf,
): FechaFilaParseada | null {
  switch (formato) {
    case 'DD/MM': {
      const m = valorColumnaFecha.match(/(\d{2})\/(\d{2})/);
      if (!m) return null;
      const dia = Number(m[1]);
      const mes = Number(m[2]);
      if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
      return { dia, mes, anio: undefined };
    }
    case 'DD/MM/YYYY': {
      const m = valorColumnaFecha.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (!m) return null;
      const dia = Number(m[1]);
      const mes = Number(m[2]);
      const anio = Number(m[3]);
      if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
      return { dia, mes, anio };
    }
    case 'DD/Mmm':
      // PR4b: parseo de mes abreviado en español (BancoEstado).
      return null;
  }
}

interface FilaCandidata extends FechaFilaParseada {
  readonly descripcion: string;
  readonly cargo: number;
  readonly abono: number;
}

/**
 * normalizarTransaccionesPdf — núcleo PURO de la normalización PDF (US-010).
 *
 * Recibe tokens ya extraídos (no conoce pdfjs, no hace I/O) + la config del
 * banco (Track B, PR3) + el período ya validado (para inferir año —
 * `undefined` solo es válido cuando `fuenteAnio.kind === 'explicito'`, mismo
 * contrato que `EstructuraPdfValidada.periodo`). Mismo patrón de diseño que
 * `evaluarEstructura` (PR3): pura, testeable con tokens sintéticos.
 *
 * Pasos:
 *   1. `agruparTokens` (PR1) reconstruye filas por Y + columnas por X — esto
 *      YA resuelve el merge palabra-por-palabra de la descripción Santander,
 *      no hay lógica especial acá (design.md decisión #4).
 *   2. Cada fila que matchea `estructura.anclaFinTabla` (opcional) TERMINA
 *      la recolección — la tabla de movimientos se considera cerrada ahí, y
 *      esa fila y todas las que vengan después (en orden de lectura) se
 *      descartan. Esto es POSICIONAL, no por valor: existe porque Santander
 *      repite la última fila del detalle DESPUÉS de su sección "Resumen de
 *      Comisiones" (un eco literal con fecha/monto válidos, que no matchea
 *      ningún `filasIgnoradas` — ver santander.strategy.ts). Una versión
 *      anterior de este módulo intentaba resolver esto deduplicando por
 *      tupla exacta {fecha,descripcion,cargo,abono}, pero eso borraba
 *      SILENCIOSAMENTE movimientos reales distintos (dos compras genuinas
 *      del mismo día/comercio/monto colapsaban en una sola, corrompiendo el
 *      total consolidado) — la deduplicación por valor fue removida.
 *   3. Cada fila que matchea `filasIgnoradas` se descarta INDIVIDUALMENTE
 *      (encabezados de sección, saldos, footers de navegador) — SOLO esa
 *      fila, la recolección continúa con las siguientes. Chequeado ANTES
 *      del filtro de fecha, porque una fila ignorada puede traer una fecha
 *      con formato válido (ver test "excluye filas que matchean
 *      filasIgnoradas..."). A propósito NO termina la tabla (a diferencia
 *      de `anclaFinTabla`): filas como "SALDO INICIAL" suelen estar entre
 *      las primeras de la tabla, y cortar ahí perdería todo el statement.
 *   4. Cada fila sin fecha interpretable en su `formatoFecha` se descarta —
 *      esto excluye naturalmente encabezados de tabla y filas de resumen sin
 *      fecha, sin reglas ad-hoc por banco.
 *   5. El año se resuelve vía `inferirAnios` (bancos con `fuenteAnio.kind
 *      === 'inferido'`) o directo desde la propia fila (`'explicito'`, BCI).
 */
export function normalizarTransaccionesPdf(
  tokens: PagedTokens,
  estructura: EstructuraPdfBanco,
  periodo: { readonly desde: string; readonly hasta: string } | undefined,
): ReadonlyArray<Transaccion> {
  const rangosX: RangoColumna[] = estructura.rangosX.map((r) => ({
    col: r.col,
    xMin: r.xMin,
    xMax: r.xMax,
  }));
  const filas = agruparTokens(tokens, rangosX, estructura.toleranciaY);

  const candidatas: FilaCandidata[] = [];
  for (const fila of filas) {
    const textoFila = Object.values(fila.columnas).join(' ');

    if (estructura.anclaFinTabla?.test(textoFila)) {
      break;
    }

    if (estructura.filasIgnoradas.some((regex) => regex.test(textoFila))) {
      continue;
    }

    const fechaTxt = fila.columnas.fecha ?? '';
    const fechaParseada = parsearFechaFila(fechaTxt, estructura.formatoFecha);
    if (!fechaParseada) continue;

    candidatas.push({
      ...fechaParseada,
      descripcion: (fila.columnas.descripcion ?? '').trim(),
      cargo: parsearMontoPdf(fila.columnas.cargo ?? ''),
      abono: parsearMontoPdf(fila.columnas.abono ?? ''),
    });
  }

  const anios = resolverAnios(candidatas, estructura, periodo);

  const transacciones: Transaccion[] = candidatas.map((c, i) => ({
    fecha: new Date(Date.UTC(anios[i], c.mes - 1, c.dia)),
    descripcion: c.descripcion,
    cargo: c.cargo,
    abono: c.abono,
  }));

  return transacciones;
}

function resolverAnios(
  candidatas: ReadonlyArray<FilaCandidata>,
  estructura: EstructuraPdfBanco,
  periodo: { readonly desde: string; readonly hasta: string } | undefined,
): number[] {
  if (estructura.fuenteAnio.kind === 'explicito') {
    // BCI: cada fila ya trae su año (ver parsearFechaFila 'DD/MM/YYYY').
    // Fallback defensivo al año actual si por alguna razón faltara (no
    // debería ocurrir con 'DD/MM/YYYY') — nunca lanza.
    return candidatas.map((c) => c.anio ?? new Date().getUTCFullYear());
  }
  // Bancos con año inferido SIEMPRE deberían traer período — evaluarEstructura
  // (PR3) ya lo exige y retorna RangoFechasInvalidoError si falta, antes de
  // que este núcleo se invoque (ver PdfjsTransactionNormalizerService).
  // Fallback defensivo al año actual si el caller lo omite igual — nunca lanza.
  const anioInicial = periodo
    ? Number(periodo.desde.slice(0, 4))
    : new Date().getUTCFullYear();
  return inferirAnios(
    candidatas.map((c) => c.mes),
    anioInicial,
  );
}
