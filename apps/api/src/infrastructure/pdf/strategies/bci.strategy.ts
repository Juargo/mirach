import { PagedTokens } from '../pdf-text-extractor';
import { coincideAnclaEnToken } from '../anchor-matching';
import { BancoConocido } from '../../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../../domain/value-objects/tipo-cuenta';
import { DetectedBank } from '../../../application/ports/bank-detector.port';

/**
 * Patrón BCI — PDF:
 *   - Página 1 trae el token "BCI- CARTOLA DE CUENTA CORRIENTE" (título del
 *     navegador) y "CARTOLA DE CUENTA CORRIENTE" (título del documento) —
 *     ambas anclas ("CARTOLA DE CUENTA CORRIENTE" y "BCI") coinciden en
 *     mayúsculas dentro de esos tokens. Checked LAST (design.md decisión
 *     #6, mismo orden que Excel): su patrón es más genérico que el resto.
 *
 * Solo la parte de DETECCIÓN (matches/extract) — estructura de tabla y
 * mapeo de normalización llegan en PR3/PR4 (ver design.md Fase 4/5).
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
}
