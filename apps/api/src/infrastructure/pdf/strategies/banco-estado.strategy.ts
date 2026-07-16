import { PagedTokens } from '../pdf-text-extractor';
import { coincideAnclaEnToken } from '../anchor-matching';
import { BancoConocido } from '../../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../../domain/value-objects/tipo-cuenta';
import { DetectedBank } from '../../../application/ports/bank-detector.port';

/**
 * Patrón BancoEstado (CuentaRUT) — PDF:
 *   - Página 1 trae un único token con el ancla "CARTOLA CUENTARUT N°"
 *     seguido del número de cuenta (ej: "CARTOLA CUENTARUT N° 12345678").
 *
 * Solo la parte de DETECCIÓN (matches/extract) — estructura de tabla y
 * mapeo de normalización llegan en PR3/PR4 (ver design.md Fase 4/5).
 */
export class BancoEstadoPdfStrategy {
  private static readonly ANCLA_ENCABEZADO = 'CARTOLA CUENTARUT N°';

  matches(tokensPagina1: PagedTokens): boolean {
    return coincideAnclaEnToken(
      tokensPagina1,
      BancoEstadoPdfStrategy.ANCLA_ENCABEZADO,
    );
  }

  extract(tokensPagina1: PagedTokens): DetectedBank {
    const texto = tokensPagina1.map((t) => t.str).join(' ');
    const match = texto.match(/N[°o]\s*(\d+)/i);
    return {
      banco: BancoConocido.BancoEstado,
      tipoCuenta: TipoCuentaConocido.CuentaRut,
      numeroCuenta: match ? match[1] : '',
    };
  }
}
