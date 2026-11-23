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
 *     la tabla) se excluye vía `filasIgnoradas` (la fila-encabezado en sí).
 *     PERO Santander además repite la ÚLTIMA fila del detalle DESPUÉS de
 *     esa sección (eco literal, con fecha/monto válidos — no matchea
 *     ningún `filasIgnoradas`) — por eso `anclaFinTabla` usa la misma
 *     ancla para cortar la recolección de filas ahí: todo lo que venga
 *     después del "Resumen de Comisiones" no es un movimiento real.
 *
 * Bandas de dinero (recalibradas 2026-11-23 contra una cartola real, fuera
 * de este repo): los montos van alineados a la DERECHA en fuente
 * monoespaciada (4,8 pt por carácter), con borde derecho en x=441 (cargos)
 * y x=523 (abonos). El X de inicio del token retrocede 4,8 pt por carácter,
 * así que cada banda cubre desde un monto de 13 caracteres
 * ("9.999.999.999") hasta uno de 1 dígito:
 *   - `cargo` [375,450): inicios posibles 378,6 … 436,2.
 *   - `abono` [460,520): inicios posibles 460,6 … 518,2.
 * Las bandas anteriores (`cargo` [395,450), `abono` [495,520)) solo cubrían
 * abonos de hasta 5 caracteres ("9.999") y cargos de hasta 9: todo abono
 * desde 10.000 quedaba fuera y la cartola se rechazaba con
 * `TokenSinAsignarSospechoso`. La auditoría de 2026-09-11 (design.md D-14)
 * las dio por sanas con una muestra de pocos montos; quedó obsoleta.
 * Quedan 10 pt de zona muerta entre ambas: un cargo nunca empieza más allá
 * de x=436,2, así que no puede caer en la banda de abono.
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
        { col: 'cargo', xMin: 375, xMax: 450 },
        { col: 'abono', xMin: 460, xMax: 520 },
      ],
      toleranciaY: 2,
      formatoFecha: 'DD/MM',
      fuenteAnio: { kind: 'inferido', desde: 'periodo-inicio' },
      // `\s+` y no un espacio literal: la cartola real emite cada palabra
      // como token propio con tokens " " intermedios, y el join por columna
      // deja "Resumen   de   Comisiones". Con el espacio literal el ancla no
      // cortaba la tabla y el eco de la última fila se sumaba dos veces.
      filasIgnoradas: [/Resumen\s+de\s+Comisiones/],
      anclaFinTabla: /Resumen\s+de\s+Comisiones/,
    };
  }
}
