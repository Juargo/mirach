import { PagedTokens } from '../pdf-text-extractor';
import { coincideAnclaEnToken } from '../anchor-matching';
import { BancoConocido } from '../../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../../domain/value-objects/tipo-cuenta';
import { DetectedBank } from '../../../application/ports/bank-detector.port';

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
 * Solo la parte de DETECCIÓN (matches/extract) — estructura de tabla y
 * mapeo de normalización llegan en PR3/PR4 (ver design.md Fase 4/5).
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
}
