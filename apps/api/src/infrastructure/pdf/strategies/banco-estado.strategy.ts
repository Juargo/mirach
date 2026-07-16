import { PagedTokens } from '../pdf-text-extractor';
import { coincideAnclaEnToken } from '../anchor-matching';
import { BancoConocido } from '../../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../../domain/value-objects/tipo-cuenta';
import { DetectedBank } from '../../../application/ports/bank-detector.port';
import { EstructuraPdfBanco } from './estructura-pdf-banco';

/**
 * Patrón BancoEstado (CuentaRUT) — PDF:
 *   - Página 1 trae un único token con el ancla "CARTOLA CUENTARUT N°"
 *     seguido del número de cuenta (ej: "CARTOLA CUENTARUT N° 12345678").
 *
 * Detección (matches/extract, PR2) + estructura de tabla (getEstructura,
 * PR3, ver design.md Fase 4). Mapeo de normalización llega en PR4.
 *
 * Estructura (empíricamente pinneada contra el fixture real):
 *   - Período: "Fecha Inicio  01/04/2026   Fecha Final  30/04/2026" — etiqueta
 *     y valor están en la MISMA fila, separados por un único token de espacio
 *     (`Fecha Inicio\s+(fecha)`).
 *   - Filas de movimiento: "02/Abr  1001234  ABONO TRANSFERENCIA...  $20.000  $35.000"
 *     — fecha SIN año (DD/Mmm, se infiere del inicio del período), N°
 *     Operación (columna numérica, x≈106-137) queda DELIBERADAMENTE fuera de
 *     `rangosX` (no es parte del esquema canónico fecha/descripcion/cargo/
 *     abono — PR4 puede retomarlo vía `tokensSinAsignar` si lo necesita).
 *     Abonos a la izquierda (x≈401) de Cargos (x≈479) — coincide con el
 *     orden real de las columnas del encabezado ("Abonos" antes que "Cargos").
 *   - "Subtotales" (fila resumen al final de la página 2) se excluye vía
 *     `filasIgnoradas`.
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

  getEstructura(): EstructuraPdfBanco {
    return {
      banco: BancoConocido.BancoEstado,
      anclasEncabezado: [
        BancoEstadoPdfStrategy.ANCLA_ENCABEZADO,
        'Fecha',
        'Descripción',
        'Abonos',
        'Cargos',
        'Saldo',
      ],
      anclasPeriodo: {
        desde: /Fecha Inicio\s+(\d{2}\/\d{2}\/\d{4})/,
        hasta: /Fecha Final\s+(\d{2}\/\d{2}\/\d{4})/,
      },
      rangosX: [
        { col: 'fecha', xMin: 40, xMax: 100 },
        { col: 'descripcion', xMin: 150, xMax: 395 },
        { col: 'abono', xMin: 395, xMax: 460 },
        { col: 'cargo', xMin: 460, xMax: 500 },
      ],
      toleranciaY: 3,
      formatoFecha: 'DD/Mmm',
      fuenteAnio: { kind: 'inferido', desde: 'periodo-inicio' },
      filasIgnoradas: [/Subtotales/],
    };
  }
}
