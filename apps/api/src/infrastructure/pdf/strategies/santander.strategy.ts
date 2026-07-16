import { PagedTokens } from '../pdf-text-extractor';
import {
  coincideAnclaEnToken,
  coincideAnclaEnVentana,
} from '../anchor-matching';
import { BancoConocido } from '../../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../../domain/value-objects/tipo-cuenta';
import { DetectedBank } from '../../../application/ports/bank-detector.port';
import { EstructuraPdfBanco } from './estructura-pdf-banco';

/**
 * Patrón Santander — PDF:
 *   - "BANCO SANTANDER CHILE" llega fragmentado en 3 tokens adyacentes con
 *     letter-spacing decorativo ("B A N C O", "S A N T A N D E R",
 *     "C H I L E") — requiere `coincideAnclaEnVentana` (no un solo token).
 *   - "CARTOLA" (columna de la tabla de encabezado) llega como token
 *     propio en mayúsculas.
 *   - Número de cuenta embebido junto al rótulo "CTA CTE LIFE", formato
 *     "0-000-XX-XXXXX-X".
 *
 * Detección (matches/extract, PR2) + estructura de tabla (getEstructura,
 * PR3, ver design.md Fase 4). Mapeo de normalización llega en PR4.
 *
 * Estructura (empíricamente pinneada contra el fixture real) — CASO
 * PARTICULAR: a diferencia de los otros 3 bancos, "DESDE"/"HASTA" están en
 * una fila ("CARTOLA DESDE HASTA PAGINA") y sus VALORES en la fila
 * siguiente ("54  01/03/2026  31/03/2026  1 de 1") — no son adyacentes. Los
 * regex de período usan un lazy-match `[\s\S]*?` que toma la 1ª fecha tras
 * el bloque de etiquetas como "desde" y la 2ª como "hasta" (ver
 * pdf-structure-extraction.spec.ts, caso "Santander").
 *   - Filas de movimiento: "05/03 Providencia  Abono Sueldo...  100001  $850.000  $850.000"
 *     — OJO: fecha y sucursal llegan FUSIONADAS en un solo token PDF
 *     ("05/03 Providencia"), por eso `rangosX.fecha` es más ancho de lo
 *     usual (PR4 deberá separar el substring de fecha del resto). Nº DCTO
 *     (x≈330) queda fuera de `rangosX` a propósito.
 *   - "Resumen de Comisiones" (sección de detalle de comisiones al pie de
 *     la tabla) se excluye vía `filasIgnoradas`.
 */
export class SantanderPdfStrategy {
  private static readonly ANCLA_BANCO = 'BANCO SANTANDER CHILE';
  private static readonly ANCLA_CARTOLA = 'CARTOLA';

  matches(tokensPagina1: PagedTokens): boolean {
    return (
      coincideAnclaEnVentana(tokensPagina1, SantanderPdfStrategy.ANCLA_BANCO) &&
      coincideAnclaEnToken(tokensPagina1, SantanderPdfStrategy.ANCLA_CARTOLA)
    );
  }

  extract(tokensPagina1: PagedTokens): DetectedBank {
    const texto = tokensPagina1.map((t) => t.str).join(' ');
    const match = texto.match(/\d-\d{3}-\d{2}-\d{5}-\d/);
    return {
      banco: BancoConocido.Santander,
      tipoCuenta: TipoCuentaConocido.CuentaCorriente,
      numeroCuenta: match ? match[0] : '',
    };
  }

  getEstructura(): EstructuraPdfBanco {
    return {
      banco: BancoConocido.Santander,
      anclasEncabezado: [
        SantanderPdfStrategy.ANCLA_CARTOLA,
        'FECHA',
        'DESCRIPCION',
        'CARGOS',
        'ABONOS',
        'SALDO',
      ],
      anclasPeriodo: {
        desde: /DESDE\s+HASTA\s+PAGINA[\s\S]*?(\d{2}\/\d{2}\/\d{4})/,
        hasta:
          /DESDE\s+HASTA\s+PAGINA[\s\S]*?\d{2}\/\d{2}\/\d{4}[\s\S]*?(\d{2}\/\d{2}\/\d{4})/,
      },
      rangosX: [
        { col: 'fecha', xMin: 25, xMax: 90 },
        { col: 'descripcion', xMin: 95, xMax: 325 },
        { col: 'cargo', xMin: 395, xMax: 450 },
        { col: 'abono', xMin: 495, xMax: 520 },
      ],
      toleranciaY: 2,
      formatoFecha: 'DD/MM',
      fuenteAnio: { kind: 'inferido', desde: 'periodo-inicio' },
      filasIgnoradas: [/Resumen de Comisiones/],
    };
  }
}
