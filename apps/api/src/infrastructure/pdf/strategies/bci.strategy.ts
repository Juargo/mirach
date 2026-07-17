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
 * Estructura (empíricamente pinneada contra el fixture real):
 *   - Período: token único "PERIODO  01-04-2026 al 30-04-2026" — separador
 *     "-" (DISTINTO del "/" que usan los otros 3 bancos) y AMBAS fechas
 *     dentro del MISMO token de valor.
 *   - `fuenteAnio.kind === 'explicito'` — BCI trae el año en cada fila
 *     (`DD/MM/YYYY`, ej. "01/04/2026") y por eso está EXENTO de
 *     `RangoFechasInvalidoError` si el ancla de período faltara.
 *   - Filas de movimiento: "01/04/2026  UGCA AUT  COMPRA COMERCIO...  100001  $23.512  $4.976.488"
 *     — columna combinada "CHEQUES Y OTROS DEPOSITOS": cargos (cheques/
 *     salidas) a la IZQUIERDA (x≈403-414) de los abonos/depósitos (x≈473-484)
 *     — mismo orden relativo que BancoEstado. SUCURSAL (x≈99) y N° DOCUMENTO
 *     (x≈324) quedan fuera de `rangosX` a propósito.
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
 *     fixture: "CHEQUES Y" cae siempre en `tokensSinAsignar`, nunca en
 *     ninguna columna, así que no puede contaminar una descripción aunque
 *     no tenga un `filasIgnoradas` propio) — sin filtrar "N° DE", la
 *     fusión de continuaciones (jd-fix-agent hardening) la pegaba como
 *     sufijo de la ÚLTIMA transacción de la página anterior (bug
 *     confirmado: "CARGO MANTENCION CUENTA" terminaba con "N° DE" pegado).
 *     La línea "FECHA ... DESCRIPCION ... DOCUMENTO" ya estaba cubierta
 *     por el filtro `/^FECHA\s+DESCRIPCION/`. Un `filasIgnoradas` normal
 *     (per-row skip) es suficiente, no hace falta `anclaFinTabla`.
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
        { col: 'cargo', xMin: 395, xMax: 420 },
        { col: 'abono', xMin: 460, xMax: 500 },
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
      ],
      fusionarContinuaciones: true,
    };
  }
}
