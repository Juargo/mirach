import { PagedTokens } from './pdf-text-extractor';
import { agruparTokens, FilaAgrupada, RangoColumna } from './token-grouping';
import {
  EstructuraPdfBanco,
  FormatoFechaPdf,
} from './strategies/estructura-pdf-banco';
import { parsearMontoPdf } from './parse-monto';
import { inferirAnios } from '../../application/services/inferir-anio';
import { Transaccion } from '../../domain/value-objects/transaccion';
import { Result } from '../../shared/result';
import {
  EstructuraPdfInvalidaError,
  ProblemaEstructuraPdf,
} from '../../domain/errors/estructura-pdf-invalida.error';

interface FechaFilaParseada {
  readonly dia: number;
  readonly mes: number;
  /** Presente solo si el formato trae el año explícito por fila (BCI, 'DD/MM/YYYY'). */
  readonly anio: number | undefined;
}

/** Meses abreviados en español (BancoEstado, formato 'DD/Mmm' — ej. "02/Abr"). */
const MESES_ES: Readonly<Record<string, number>> = {
  ene: 1,
  feb: 2,
  mar: 3,
  abr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dic: 12,
};

/**
 * Token "con forma de monto" que cayó fuera de `rangosX` (columna Saldo,
 * casi siempre — deliberadamente excluida del esquema canónico en los 4
 * bancos, ver cada strategy). Exige "$" O al menos un grupo separador de
 * miles ("\.\d{3}") a propósito: así NO confunde un número de
 * operación/documento/sucursal (dígitos planos sin separador, también
 * deliberadamente fuera de `rangosX`) con un monto real — evita falsos
 * positivos contra los 4 fixtures reales (ver "tokensSinAsignar" abajo).
 */
const REGEX_POSIBLE_MONTO = /^\$-?\d+(\.\d{3})*$|^-?\d{1,3}(\.\d{3})+$/;

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
 * 'DD/Mmm' (BancoEstado, mes en español abreviado) — implementado en PR4b vía
 * `MESES_ES`, case-insensitive ("Abr"/"abr"/"ABR" todos resuelven a 4).
 *
 * Nunca lanza: formato desconocido, mes fuera de rango o texto sin match →
 * `null` (fila descartada por el caller; este módulo no tiene taxonomía de
 * error por fecha, a diferencia del monto — ver parse-monto.ts).
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
    case 'DD/Mmm': {
      const m = valorColumnaFecha.match(/(\d{2})\/([A-Za-z]{3})/);
      if (!m) return null;
      const dia = Number(m[1]);
      const mes = MESES_ES[m[2].toLowerCase()];
      if (!mes || dia < 1 || dia > 31) return null;
      return { dia, mes, anio: undefined };
    }
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
 * Retorna `Result` (PR4b — antes retornaba el array directo): agrupa TODOS
 * los problemas detectados en una sola pasada, mismo criterio UX que
 * `EstructuraPdfInvalidaError`/`NormalizacionInvalidaError` (Excel) — no
 * corta en el primer problema.
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
 *      ningún `filasIgnoradas` — ver santander.strategy.ts). SOLO Santander
 *      la usa (PR4a) — BancoEstado/Chile/BCI (PR4b) no la necesitan: sus
 *      fixtures reales no tienen ningún eco/repetición post-tabla, y
 *      activarla sin un caso real probado arriesgaría cortar filas legítimas
 *      de una página posterior (ver nota de riesgo en engram apply-progress).
 *   3. Cada fila que matchea `filasIgnoradas` se descarta INDIVIDUALMENTE
 *      (encabezados de sección, saldos, footers de navegador, encabezados de
 *      tabla repetidos en páginas siguientes) — SOLO esa fila, la
 *      recolección continúa con las siguientes. Chequeado ANTES del filtro
 *      de fecha, porque una fila ignorada puede traer una fecha con formato
 *      válido. A propósito NO termina la tabla (a diferencia de
 *      `anclaFinTabla`): filas como "SALDO INICIAL" suelen estar entre las
 *      primeras de la tabla, y cortar ahí perdería todo el statement.
 *   4. Fila sin fecha interpretable en su `formatoFecha`:
 *        - Si `estructura.fusionarContinuaciones` está activo (SOLO BCI,
 *          PR4b) Y la fila no trae cargo/abono propios Y trae texto de
 *          descripción Y ya existe una candidata previa → se fusiona como
 *          SUFIJO de la descripción de esa candidata (continuación
 *          multilínea, ver bci.strategy.ts), SALVO que esta misma fila ya
 *          haya sido consumida como PREFIJO de la fila fechada siguiente
 *          (hardening jd-fix-agent, ver `calcularPrefijosContinuacion`: BCI
 *          también parte descripciones con la etiqueta ARRIBA de la fila
 *          fechada a la que pertenece, no solo abajo — geometría verificada
 *          contra bci-cartola-test.pdf). Si no se cumple alguna condición,
 *          la fila se descarta sin más (mismo comportamiento que antes de
 *          PR4b para los otros 3 bancos).
 *   5. Fila CON fecha interpretable = candidata a transacción real:
 *        - Señal money-safe: si AMBAS columnas cargo/abono quedaron vacías
 *          pero `fila.tokensSinAsignar` trae un token con forma de monto
 *          (fuera de `rangosX` por deriva geométrica) → se reporta
 *          `TokenSinAsignarSospechoso` en vez de aceptar la fila como
 *          $0/$0 en silencio.
 *        - Cada columna de monto NO VACÍA que `parsearMontoPdf` no puede
 *          interpretar → se reporta `MontoIleeible` (columna vacía SÍ es
 *          válida y vale 0 — CA-06, igual que Excel).
 *   6. El año se resuelve vía `inferirAnios` (bancos con `fuenteAnio.kind
 *      === 'inferido'`) o directo desde la propia fila (`'explicito'`, BCI).
 */
export function normalizarTransaccionesPdf(
  tokens: PagedTokens,
  estructura: EstructuraPdfBanco,
  periodo: { readonly desde: string; readonly hasta: string } | undefined,
): Result<ReadonlyArray<Transaccion>, EstructuraPdfInvalidaError> {
  const rangosX: RangoColumna[] = estructura.rangosX.map((r) => ({
    col: r.col,
    xMin: r.xMin,
    xMax: r.xMax,
  }));
  const filasCrudas = agruparTokens(tokens, rangosX, estructura.toleranciaY);

  // Pre-filtro: `anclaFinTabla` corta la recolección y `filasIgnoradas`
  // descarta filas individuales — separado en su propia pasada (antes vivía
  // inline en el mismo loop que arma las candidatas) porque el hardening de
  // `fusionarContinuaciones` (jd-fix-agent) necesita mirar hacia ADELANTE en
  // la lista YA filtrada para decidir si una fila huérfana es PREFIJO de la
  // fila fechada siguiente — ver `calcularPrefijosContinuacion` abajo. El
  // conjunto de filas retenidas y su orden es IDÉNTICO al comportamiento
  // previo, solo se movió a una pasada anterior.
  const filasRelevantes: FilaAgrupada[] = [];
  for (const fila of filasCrudas) {
    const textoFila = Object.values(fila.columnas).join(' ');
    if (estructura.anclaFinTabla?.test(textoFila)) {
      break;
    }
    if (estructura.filasIgnoradas.some((regex) => regex.test(textoFila))) {
      continue;
    }
    filasRelevantes.push(fila);
  }

  const { prefijoParaFila, filasConsumidasComoPrefijo } =
    estructura.fusionarContinuaciones
      ? calcularPrefijosContinuacion(filasRelevantes, estructura.formatoFecha)
      : { prefijoParaFila: new Map<number, string>(), filasConsumidasComoPrefijo: new Set<number>() };

  const problemas: ProblemaEstructuraPdf[] = [];
  const candidatas: FilaCandidata[] = [];
  let filaIndex = 0;

  for (let i = 0; i < filasRelevantes.length; i++) {
    const fila = filasRelevantes[i];

    const fechaTxt = fila.columnas.fecha ?? '';
    const fechaParseada = parsearFechaFila(fechaTxt, estructura.formatoFecha);
    const cargoTxt = (fila.columnas.cargo ?? '').trim();
    const abonoTxt = (fila.columnas.abono ?? '').trim();
    const descTxt = (fila.columnas.descripcion ?? '').trim();

    if (!fechaParseada) {
      if (
        estructura.fusionarContinuaciones &&
        !filasConsumidasComoPrefijo.has(i) &&
        cargoTxt === '' &&
        abonoTxt === '' &&
        descTxt !== '' &&
        candidatas.length > 0
      ) {
        const ultima = candidatas[candidatas.length - 1];
        candidatas[candidatas.length - 1] = {
          ...ultima,
          descripcion: `${ultima.descripcion} ${descTxt}`.trim(),
        };
      }
      continue;
    }

    filaIndex++;

    if (
      cargoTxt === '' &&
      abonoTxt === '' &&
      fila.tokensSinAsignar.some((t) => REGEX_POSIBLE_MONTO.test(t.str))
    ) {
      problemas.push({ tipo: 'TokenSinAsignarSospechoso', fila: filaIndex });
      continue;
    }

    let cargo = 0;
    if (cargoTxt !== '') {
      const n = parsearMontoPdf(cargoTxt);
      if (n === null) {
        problemas.push({
          tipo: 'MontoIleeible',
          fila: filaIndex,
          columna: 'cargo',
        });
        continue;
      }
      cargo = n;
    }

    let abono = 0;
    if (abonoTxt !== '') {
      const n = parsearMontoPdf(abonoTxt);
      if (n === null) {
        problemas.push({
          tipo: 'MontoIleeible',
          fila: filaIndex,
          columna: 'abono',
        });
        continue;
      }
      abono = n;
    }

    const prefijo = prefijoParaFila.get(i);
    const descripcionFinal =
      prefijo !== undefined ? `${prefijo} ${descTxt}`.trim() : descTxt;

    candidatas.push({
      ...fechaParseada,
      descripcion: descripcionFinal,
      cargo,
      abono,
    });
  }

  if (problemas.length > 0) {
    return Result.fail(
      new EstructuraPdfInvalidaError(estructura.banco, problemas),
    );
  }

  const anios = resolverAnios(candidatas, estructura, periodo);

  const transacciones: Transaccion[] = [];
  for (let i = 0; i < candidatas.length; i++) {
    const c = candidatas[i];
    // El VO Transaccion protege el invariante en un único lugar (cargo XOR
    // abono, montos enteros ≥ 0). Un fail aquí implica una fila con montos en
    // AMBAS columnas o un negativo residual → estructura del PDF inválida.
    const tx = Transaccion.crear({
      fecha: new Date(Date.UTC(anios[i], c.mes - 1, c.dia)),
      descripcion: c.descripcion,
      cargo: BigInt(c.cargo),
      abono: BigInt(c.abono),
    });
    if (tx.isFail()) {
      return Result.fail(
        new EstructuraPdfInvalidaError(estructura.banco, [
          { tipo: 'MontoIleeible', fila: i, columna: 'cargo' },
        ]),
      );
    }
    transacciones.push(tx.getValue());
  }

  return Result.ok(transacciones);
}

/**
 * calcularPrefijosContinuacion — hardening jd-fix-agent (SOLO se invoca
 * cuando `estructura.fusionarContinuaciones` está activo, es decir SOLO
 * BCI).
 *
 * El `fusionarContinuaciones` original (PR4b) era greedy-suffix puro: toda
 * fila huérfana (sin fecha, sin cargo/abono propios, con texto) se pegaba
 * SIEMPRE como sufijo de la candidata MÁS RECIENTE. Contra el fixture real
 * (bci-cartola-test.pdf) eso es correcto para algunas filas huérfanas pero
 * incorrecto para otras: BCI parte la descripción de un mismo movimiento en
 * hasta 3 líneas físicas — una línea "etiqueta" que aparece ANTES de la fila
 * con fecha/monto, la propia fila (a veces con un fragmento — ej. un número
 * de documento largo que no entra en la columna "N° DOCUMENTO", x≈324, y se
 * desborda dentro de `descripcion`; o directamente vacía) y una línea
 * "sufijo" que aparece DESPUÉS.
 *
 * La distancia en Y NO alcanza para desambiguar (verificado contra el
 * fixture real: las filas están espaciadas uniformemente ~11pt, así que una
 * huérfana entre dos fechadas queda EQUIDISTANTE de ambas). La señal que sí
 * discrimina, puramente geométrica/estructural (no es una regla semántica
 * sobre el contenido de negocio): una fila fechada "recibe" como PREFIJO la
 * huérfana que la precede inmediatamente cuando su PROPIA columna
 * `descripcion` viene vacía o compuesta solo por dígitos (`/^\d+$/`) — en
 * los 3 casos reales del fixture (cargo 250213, cargo 5375, abono 50000)
 * eso señala que la fila fechada no trae una descripción de una sola línea
 * completa. Las filas fechadas con una descripción "normal" (con letras,
 * ej. "TRANSFER A TERCERO EJEMPLO") nunca reciben un prefijo aunque tengan
 * una huérfana justo arriba — esa huérfana pertenece a la SIGUIENTE fila
 * fechada, no a esta (las 18 filas reales de bci-cartola-test.pdf verifican
 * esta regla sin excepción — ver engram apply-progress sprint4-pdf-ingesta).
 *
 * Devuelve:
 *   - `prefijoParaFila`: índice en `filasRelevantes` de la fila fechada →
 *     texto a anteponerle a su propia descripción.
 *   - `filasConsumidasComoPrefijo`: índices de las filas huérfanas ya
 *     usadas como prefijo — el loop principal las salta al decidir el
 *     sufijo clásico, para no fusionarlas dos veces.
 *
 * Pura, no lanza — mismo contrato que el resto de este módulo.
 */
function calcularPrefijosContinuacion(
  filasRelevantes: ReadonlyArray<FilaAgrupada>,
  formatoFecha: FormatoFechaPdf,
): {
  prefijoParaFila: Map<number, string>;
  filasConsumidasComoPrefijo: Set<number>;
} {
  const prefijoParaFila = new Map<number, string>();
  const filasConsumidasComoPrefijo = new Set<number>();

  for (let i = 0; i < filasRelevantes.length; i++) {
    const fila = filasRelevantes[i];
    const fechaTxt = fila.columnas.fecha ?? '';
    const fechaParseada = parsearFechaFila(fechaTxt, formatoFecha);
    if (fechaParseada) continue; // solo evalúa filas huérfanas (sin fecha propia)

    const cargoTxt = (fila.columnas.cargo ?? '').trim();
    const abonoTxt = (fila.columnas.abono ?? '').trim();
    const descTxt = (fila.columnas.descripcion ?? '').trim();
    // Money-safety: nunca trata como continuación una fila que trae su
    // propio monto — mismo guard que el loop principal.
    if (cargoTxt !== '' || abonoTxt !== '' || descTxt === '') continue;

    const siguiente = filasRelevantes[i + 1];
    if (!siguiente) continue; // última fila del documento, sin candidata siguiente

    const siguienteFecha = parsearFechaFila(
      siguiente.columnas.fecha ?? '',
      formatoFecha,
    );
    if (!siguienteFecha) continue; // la fila siguiente no es una transacción fechada

    const siguienteDescTxt = (siguiente.columnas.descripcion ?? '').trim();
    const esFragmento =
      siguienteDescTxt === '' || /^\d+$/.test(siguienteDescTxt);
    if (!esFragmento) continue; // fila fechada siguiente ya trae descripción completa

    const previo = prefijoParaFila.get(i + 1);
    prefijoParaFila.set(i + 1, previo !== undefined ? `${previo} ${descTxt}` : descTxt);
    filasConsumidasComoPrefijo.add(i);
  }

  return { prefijoParaFila, filasConsumidasComoPrefijo };
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
