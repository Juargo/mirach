import { PagedTokens } from '../pdf-text-extractor';
import { coincideAnclaEnToken } from '../anchor-matching';
import { BancoConocido } from '../../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../../domain/value-objects/tipo-cuenta';
import { DetectedBank } from '../../../application/ports/bank-detector.port';
import { EstructuraPdfBanco } from './estructura-pdf-banco';

/**
 * Patrón BCI — PDF:
 *   - Página 1 trae el token "BCI- CARTOLA DE CUENTA CORRIENTE" (título del
 *     navegador) y "CARTOLA DE CUENTA CORRIENTE" (título del documento) —
 *     ambas anclas ("CARTOLA DE CUENTA CORRIENTE" y "BCI") coinciden en
 *     mayúsculas dentro de esos tokens. Checked LAST (design.md decisión
 *     #6, mismo orden que Excel): su patrón es más genérico que el resto.
 *
 * Detección (matches/extract, PR2) + estructura de tabla (getEstructura,
 * PR3, ver design.md Fase 4). Mapeo de normalización llega en PR4.
 *
 * Estructura (empíricamente pinneada contra el fixture real; bandas de
 * monto RE-calibradas 2026-08-30 contra 15 cartolas reales del usuario —
 * ver nota en `rangosX` abajo):
 *   - Período: token único "PERIODO  01-04-2026 al 30-04-2026" — separador
 *     "-" (DISTINTO del "/" que usan los otros 3 bancos) y AMBAS fechas
 *     dentro del MISMO token de valor.
 *   - `fuenteAnio.kind === 'explicito'` — BCI trae el año en cada fila
 *     (`DD/MM/YYYY`, ej. "01/04/2026") y por eso está EXENTO de
 *     `RangoFechasInvalidoError` si el ancla de período faltara.
 *   - Filas de movimiento: "01/04/2026  UGCA AUT  COMPRA COMERCIO...  100001  $23.512  $4.976.488"
 *     — columna combinada "CHEQUES Y OTROS DEPOSITOS": cargos (cheques/
 *     salidas) a la IZQUIERDA de los abonos/depósitos — mismo orden
 *     relativo que BancoEstado. Ambas columnas de monto están alineadas a
 *     la DERECHA: el x de INICIO del token corre hacia la izquierda a
 *     medida que el monto se hace más ancho (un cargo de 8 dígitos
 *     "10.000.000" arranca en x≈381; uno de 3 dígitos en x≈406). Las
 *     bandas originales (cargo 395-420, abono 460-500) se midieron contra
 *     un único fixture de montos chicos y perdían los montos anchos —
 *     cada fila afectada fallaba con `TokenSinAsignarSospechoso` porque
 *     su token de Saldo (siempre fuera de banda, money-shaped) quedaba
 *     como único monto visible. Medición agregada de 15 cartolas reales
 *     (2026-08-30): cargos x=[381.1, 409.7], abonos x=[455.3, 476.6],
 *     fechas x=[42.9, 44.1], N° DOCUMENTO x=[295.5, 317.8], Saldo
 *     x=[542.2, 561.9]. SUCURSAL (x≈99) y el Saldo quedan fuera de
 *     `rangosX` a propósito; el N° DOCUMENTO cae dentro de `descripcion`
 *     (145-320) — comportamiento pinneado desde el fixture original (el
 *     overflow "4800000001" en x≈309 es PARTE de la descripción esperada
 *     del spec del normalizador), por eso `descripcion.xMax` NO se
 *     recorta. Los encabezados "CHEQUES Y" (x≈360-361) / "OTROS" (x≈372)
 *     / "CARGOS" (x≈368) ahora pueden caer DENTRO de la banda `cargo`:
 *     inofensivo — viven en filas sin fecha, que con la columna cargo
 *     no-vacía ni se fusionan ni se vuelven candidatas.
 *   - El footer de navegador (URL de bci.cl, timestamp de impresión,
 *     indicador de página "1/2") se excluye vía `filasIgnoradas`.
 *   - `fusionarContinuaciones: true` (PR4b, ÚNICO banco que lo activa): BCI
 *     divide algunas descripciones en 2-3 líneas físicas del PDF alrededor
 *     de la fila con fecha+monto (ej. "PAGO CREDITO D00000000001" en la
 *     línea de arriba, la fila con fecha/monto en el medio, "001/012" en la
 *     línea de abajo — ver pdf-normalization.ts). Esas líneas sin fecha ni
 *     monto propio se fusionan como sufijo de la transacción candidata más
 *     reciente en vez de perderse.
 *   - `filasIgnoradas` incluye además guardas descubiertas contra el
 *     fixture real de 2 páginas: el encabezado de tabla completo se REPITE
 *     al inicio de la página 2 en 3 líneas físicas — "CHEQUES Y" / "N° DE
 *     ... OTROS ... DEPOSITOS" / "FECHA ... DESCRIPCION ... DOCUMENTO" — y
 *     el título del documento también se reimprime por página ("CARTOLA DE
 *     CUENTA CORRIENTE"). De las 3 líneas del encabezado de tabla, solo
 *     "N° DE" landea dentro de `rangosX.descripcion` (verificado contra el
 *     fixture) — sin filtrar "N° DE", la
 *     fusión de continuaciones (jd-fix-agent hardening) la pegaba como
 *     sufijo de la ÚLTIMA transacción de la página anterior (bug
 *     confirmado: "CARGO MANTENCION CUENTA" terminaba con "N° DE" pegado).
 *     La línea "FECHA ... DESCRIPCION ... DOCUMENTO" ya estaba cubierta
 *     por el filtro `/^FECHA\s+DESCRIPCION/`. Un `filasIgnoradas` normal
 *     (per-row skip) es suficiente, no hace falta `anclaFinTabla`. "CHEQUES
 *     Y" (fila de arriba del mismo encabezado, x≈360-361) SÍ puede caer
 *     DENTRO de la banda `cargo` desde la recalibración de `rangosX` de
 *     2026-08-30 (antes caía siempre en `tokensSinAsignar`, nunca en
 *     ninguna columna) — inofensivo porque vive en una fila SIN fecha
 *     propia, así que nunca se vuelve candidata ni recibe una fusión (el
 *     guard de `fusionarContinuaciones` exige cargo/abono propios vacíos, y
 *     esta fila trae la columna cargo no-vacía).
 *   - `omitirFilasMontoCero: true` (contrato completo en
 *     estructura-pdf-banco.ts): BCI imprime un "0" LITERAL en la columna de
 *     cargos para filas "VERIFICACION DE CUENTA" en cartolas con línea de
 *     sobregiro activa (el saldo corrido confirma que no mueven dinero) —
 *     se descartan como statement de valor cero, no como movimiento. El
 *     caso "ambas columnas vacías" (deriva geométrica, sin cero explícito)
 *     sigue el camino de fallo ruidoso normal, incluso para BCI.
 */
export class BciPdfStrategy {
  private static readonly ANCLA_TITULO = 'CARTOLA DE CUENTA CORRIENTE';
  private static readonly ANCLA_BANCO = 'BCI';

  matches(tokensPagina1: PagedTokens): boolean {
    return (
      coincideAnclaEnToken(tokensPagina1, BciPdfStrategy.ANCLA_TITULO) &&
      coincideAnclaEnToken(tokensPagina1, BciPdfStrategy.ANCLA_BANCO)
    );
  }

  extract(tokensPagina1: PagedTokens): DetectedBank {
    const texto = tokensPagina1.map((t) => t.str).join(' ');
    const match = texto.match(/N[°o]\s*CUENTA\s*(\d+)/i);
    return {
      banco: BancoConocido.BCI,
      tipoCuenta: TipoCuentaConocido.CuentaCorriente,
      numeroCuenta: match ? match[1] : '',
    };
  }

  getEstructura(): EstructuraPdfBanco {
    return {
      banco: BancoConocido.BCI,
      anclasEncabezado: [
        BciPdfStrategy.ANCLA_TITULO,
        BciPdfStrategy.ANCLA_BANCO,
        'FECHA',
        'DESCRIPCION',
        'SALDO DIARIO',
      ],
      anclasPeriodo: {
        desde: /PERIODO\s+(\d{2}-\d{2}-\d{4})/,
        hasta: /PERIODO\s+\d{2}-\d{2}-\d{4}\s+al\s+(\d{2}-\d{2}-\d{4})/,
      },
      rangosX: [
        { col: 'fecha', xMin: 35, xMax: 85 },
        { col: 'descripcion', xMin: 145, xMax: 320 },
        // Bandas de monto recalibradas 2026-08-30 (15 cartolas reales, ver
        // docblock): right-aligned, el xMin debe cubrir el monto MÁS ANCHO
        // plausible, no el más ancho ya visto — margen a la izquierda del
        // mínimo observado (381.1 / 455.3) sin invadir el N° DOCUMENTO
        // (≤317.8) ni fusionar ambas columnas entre sí.
        { col: 'cargo', xMin: 360, xMax: 430 },
        { col: 'abono', xMin: 435, xMax: 500 },
      ],
      toleranciaY: 2,
      formatoFecha: 'DD/MM/YYYY',
      fuenteAnio: { kind: 'explicito' },
      filasIgnoradas: [
        /^https:\/\/www\.bci\.cl/,
        /^\d{1,2}\/\d{2}\/\d{2},\s*\d{1,2}:\d{2}\s*[AP]M$/,
        /^\d\/\d$/,
        // Encabezado de tabla repetido al inicio de cada página nueva
        // (línea 3 de 3 — "FECHA ... DESCRIPCION ... DOCUMENTO").
        /^FECHA\s+DESCRIPCION/,
        // Encabezado de tabla repetido al inicio de cada página nueva
        // (línea 2 de 3 — "N° DE" / "OTROS" / "DEPOSITOS"). Es la ÚNICA de
        // las 3 líneas del encabezado que landea dentro de la columna
        // `descripcion` (las otras dos caen fuera de `rangosX` o ya
        // estaban cubiertas arriba) — sin este filtro contamina la
        // descripción de la última transacción de la página anterior vía
        // `fusionarContinuaciones`. Ancla exacta (no una substring amplia)
        // porque ningún movimiento real del fixture contiene "N° DE".
        /^\s*N°\s*DE\s*$/,
        // Título del documento, reimpreso en cada página.
        /CARTOLA DE CUENTA CORRIENTE/,
        // Fila de etiquetas de la sección de totales (última página):
        // "Periodo" cae en la banda `fecha` (x≈49) y "Saldo Anterior" en
        // `descripcion` (x≈298) — una fila sin fecha parseable, sin montos
        // propios y con texto de descripción, exactamente la forma que
        // `fusionarContinuaciones` pegaría como sufijo de la ÚLTIMA
        // transacción (leak confirmado contra las 15 cartolas reales,
        // 2026-08-30; invisible antes de recalibrar las bandas porque la
        // validación fallaba primero). Las demás filas de la sección de
        // totales ("Total Cargos y"/"Cheques"/"Saldo Disponible"/las filas
        // de valores) se descartan solas: todas traen texto o montos dentro
        // de la banda `cargo`/`abono`, lo que bloquea la fusión.
        // Con `\s*$` al final igual que el guard de "N° DE": el textoFila
        // junta las 4 columnas con espacios y las columnas de monto vacías
        // dejan whitespace colgando al final.
        /^Periodo\s+Saldo Anterior\s*$/,
      ],
      fusionarContinuaciones: true,
      omitirFilasMontoCero: true,
    };
  }
}
