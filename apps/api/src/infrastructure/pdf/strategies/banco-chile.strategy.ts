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
 * Estructura (empíricamente pinneada contra el fixture real; `rangosX` de
 * monto RECALIBRADOS el 2026-08-30 contra 16 cartolas reales — ver spec):
 *   - Período: "DESDE : 01/04/2026   HASTA : 30/04/2026" — etiqueta y valor
 *     en la MISMA fila (separados por ":" — `DESDE\s*:?\s*(fecha)`).
 *   - Filas de movimiento: "02/04  COMPRA COMERCIO...  INTERNET  808  $45.300  $1.639.160"
 *     — fecha SIN año (DD/MM, se infiere). SUCURSAL (x≈232) y N° DOCTO
 *     (x≈304-316: el rótulo del encabezado en 304.0, el valor por fila más a
 *     la derecha) quedan DELIBERADAMENTE fuera de `rangosX` (no son parte
 *     del esquema canónico). "SALDO INICIAL"/"SALDO FINAL" se excluyen vía
 *     `filasIgnoradas` — importan porque son filas CON fecha cuyo único
 *     monto es el saldo (fuera de banda): sin el filtro dispararían la
 *     guarda money-safe.
 *   - Columnas de monto alineadas a la DERECHA (misma lección que BCI,
 *     PR #526): el x de INICIO del token corre hacia la izquierda a medida
 *     que el monto se ensancha. Observado en 16 cartolas (2026-08-30):
 *     cargos x=[395.9, 423.1] (el máximo es un cargo de 1 dígito), abonos
 *     x=[472.0, 503.1] (un abono de 8 dígitos arranca en ~472.0; uno de 1
 *     dígito en ~503.1), saldos x=[548.0, 565.5]. Las bandas
 *     [360,445)/[450,530) cubren esos rangos OBSERVADOS con margen
 *     deliberado para montos aún más anchos que los ya vistos — el fixture
 *     sintético prueba ese margen con un cargo de 8 dígitos en x≈392.5,
 *     por debajo del mínimo observado (395.9) pero dentro de la banda. Las
 *     bandas se mantienen a la derecha de N° DOCTO y dejan FUERA los
 *     saldos y los valores del resumen final ("SALDO DISPONIBLE A LA
 *     FECHA" x≈543.4, "OTROS ABONOS"/"OTROS CARGOS" x≈257/350 — todos en
 *     filas sin fecha).
 *   - Los fragmentos del encabezado de tabla ("O CARGOS" x≈368, "MONTO
 *     DEPOSITOS" x≈433, "O ABONOS" x≈451) caen dentro de las bandas nuevas,
 *     pero viven en filas sin fecha, que nunca llegan a candidatas (este
 *     banco no activa `fusionarContinuaciones`).
 *   - Sin `omitirFilasMontoCero`: en las 16 cartolas ningún movimiento
 *     fechado imprime un "0" literal en cargo/abono (los "0" viven en las
 *     filas de resumen, sin fecha) — el flag queda apagado hasta tener un
 *     caso real (precedente BCI: se activó recién al observarlo).
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
        { col: 'cargo', xMin: 360, xMax: 445 },
        { col: 'abono', xMin: 450, xMax: 530 },
      ],
      toleranciaY: 2,
      formatoFecha: 'DD/MM',
      fuenteAnio: { kind: 'inferido', desde: 'periodo-inicio' },
      // Anclado a la forma exacta de la fila de resumen, no a una substring
      // amplia: `textoFila` junta fecha+descripcion+cargo+abono con espacios
      // (ver pdf-normalization.ts) y ambas columnas de monto quedan vacías
      // (el saldo vive fuera de `rangosX` a propósito) — "DD/MM SALDO
      // INICIAL" / "DD/MM SALDO FINAL" con dos espacios finales, verificado
      // contra las 15 cartolas reales (2026-08-30). Sin el ancla, una
      // transacción real cuya descripción CONTUVIERA "SALDO FINAL" como
      // substring (ej. "AJUSTE SALDO FINAL PRESTAMO") se descartaría en
      // silencio en vez de procesarse como movimiento normal.
      filasIgnoradas: [
        /^\d{2}\/\d{2}\s+SALDO INICIAL\s*$/,
        /^\d{2}\/\d{2}\s+SALDO FINAL\s*$/,
      ],
    };
  }
}
