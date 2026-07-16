import { PagedTokens } from '../pdf-text-extractor';
import {
  coincideAnclaEnToken,
  coincideAnclaEnVentana,
} from '../anchor-matching';
import { BancoConocido } from '../../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../../domain/value-objects/tipo-cuenta';
import { DetectedBank } from '../../../application/ports/bank-detector.port';

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
 * Solo la parte de DETECCIÓN (matches/extract) — estructura de tabla y
 * mapeo de normalización llegan en PR3/PR4 (ver design.md Fase 4/5).
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
}
