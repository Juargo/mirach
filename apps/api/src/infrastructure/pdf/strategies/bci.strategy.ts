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
      ],
    };
  }
}
