import { PagedTokens } from '../pdf-text-extractor';
import { coincideAnclaEnToken } from '../anchor-matching';
import { BancoConocido } from '../../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../../domain/value-objects/tipo-cuenta';
import { DetectedBank } from '../../../application/ports/bank-detector.port';
import { EstructuraPdfBanco } from './estructura-pdf-banco';

/**
 * Patrón Banco de Chile — PDF:
 *   - Página 1 trae el título "Estado de Cuenta" (Title Case, token propio)
 *     y el rótulo "CUENTA CORRIENTE" (mayúsculas, token propio) cerca del
 *     encabezado de cuenta. Se exige AMBAS anclas (AND) — cada una sola
 *     coincide por accidente en otro banco (ver anchor-matching.ts: BCI
 *     trae "ESTADO DE CUENTA..." decorativo en mayúsculas, Santander trae
 *     "estado de cuenta" en minúsculas dentro de su nota al pie — ninguna
 *     comparte la capitalización Title Case real de este encabezado).
 *
 * Detección (matches/extract, PR2) + estructura de tabla (getEstructura,
 * PR3, ver design.md Fase 4). Mapeo de normalización llega en PR4.
 *
 * Estructura (empíricamente pinneada contra el fixture real):
 *   - Período: "DESDE : 01/04/2026   HASTA : 30/04/2026" — etiqueta y valor
 *     en la MISMA fila (separados por ":" — `DESDE\s*:?\s*(fecha)`).
 *   - Filas de movimiento: "02/04  COMPRA COMERCIO...  INTERNET  808  $45.300  $1.639.160"
 *     — fecha SIN año (DD/MM, se infiere). SUCURSAL (x≈232) y N° DOCTO
 *     (x≈309) quedan DELIBERADAMENTE fuera de `rangosX` (no son parte del
 *     esquema canónico). "SALDO INICIAL"/"SALDO FINAL" se excluyen vía
 *     `filasIgnoradas`.
 */
export class BancoChilePdfStrategy {
  private static readonly ANCLA_TITULO = 'Estado de Cuenta';
  private static readonly ANCLA_TIPO_CUENTA = 'CUENTA CORRIENTE';

  matches(tokensPagina1: PagedTokens): boolean {
    return (
      coincideAnclaEnToken(tokensPagina1, BancoChilePdfStrategy.ANCLA_TITULO) &&
      coincideAnclaEnToken(
        tokensPagina1,
        BancoChilePdfStrategy.ANCLA_TIPO_CUENTA,
      )
    );
  }

  extract(tokensPagina1: PagedTokens): DetectedBank {
    const texto = tokensPagina1.map((t) => t.str).join(' ');
    const match = texto.match(/N[°o]\s*DE\s*CUENTA\s*:?\s*(\d+)/i);
    return {
      banco: BancoConocido.BancoChile,
      tipoCuenta: TipoCuentaConocido.CuentaCorriente,
      numeroCuenta: match ? match[1] : '',
    };
  }

  getEstructura(): EstructuraPdfBanco {
    return {
      banco: BancoConocido.BancoChile,
      anclasEncabezado: [
        BancoChilePdfStrategy.ANCLA_TITULO,
        BancoChilePdfStrategy.ANCLA_TIPO_CUENTA,
        'FECHA',
        'DETALLE DE TRANSACCION',
        'SALDO',
      ],
      anclasPeriodo: {
        desde: /DESDE\s*:?\s*(\d{2}\/\d{2}\/\d{4})/,
        hasta: /HASTA\s*:?\s*(\d{2}\/\d{2}\/\d{4})/,
      },
      rangosX: [
        { col: 'fecha', xMin: 15, xMax: 55 },
        { col: 'descripcion', xMin: 55, xMax: 228 },
        { col: 'cargo', xMin: 390, xMax: 440 },
        { col: 'abono', xMin: 495, xMax: 520 },
      ],
      toleranciaY: 2,
      formatoFecha: 'DD/MM',
      fuenteAnio: { kind: 'inferido', desde: 'periodo-inicio' },
      filasIgnoradas: [/SALDO INICIAL/, /SALDO FINAL/],
    };
  }
}
