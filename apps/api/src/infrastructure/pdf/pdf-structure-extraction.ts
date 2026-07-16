import { Result } from '../../shared/result';
import { PagedTokens } from './pdf-text-extractor';
import { coincideAnclaEnToken } from './anchor-matching';
import { EstructuraPdfBanco } from './strategies/estructura-pdf-banco';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import {
  EstructuraPdfInvalidaError,
  ProblemaEstructuraPdf,
} from '../../domain/errors/estructura-pdf-invalida.error';
import { RangoFechasInvalidoError } from '../../domain/errors/rango-fechas-invalido.error';
import { EstructuraPdfValidada } from '../../application/ports/pdf-structure-validator.port';

/**
 * pdf-structure-extraction — núcleo PURO de la validación de estructura PDF.
 *
 * Todas las funciones de este módulo reciben `PagedTokens` ya extraídos (no
 * conocen pdfjs ni hacen I/O) — así se pueden testear con tokens sintéticos
 * sin necesidad de mutar los PDFs reales para los casos negativos (mismo
 * enfoque que `agruparTokens`/`inferirAnios`, design.md decisiones #4/#5).
 * `PdfjsStructureValidatorService` es la única capa que toca pdfjs — llama
 * `evaluarEstructura` con los tokens ya extraídos.
 */

/** Anclas de `anclas` que NO aparecen en ningún token (case-sensitive, ver anchor-matching.ts). */
export function detectarAnclasFaltantes(
  tokens: PagedTokens,
  anclas: ReadonlyArray<string>,
): string[] {
  return anclas.filter((ancla) => !coincideAnclaEnToken(tokens, ancla));
}

/** Todos los tokens del documento, en orden de lectura, unidos con un espacio. */
export function construirTextoCompleto(tokens: PagedTokens): string {
  const ordenados = [...tokens].sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    if (a.y !== b.y) return b.y - a.y;
    return a.x - b.x;
  });
  return ordenados.map((t) => t.str).join(' ');
}

/**
 * Aplica `anclasPeriodo.desde`/`.hasta` (cada una con UN grupo de captura)
 * sobre `textoCompleto`. Retorna `undefined` si cualquiera de los dos no
 * matchea — un período parcial no es un período válido.
 */
export function extraerPeriodo(
  textoCompleto: string,
  anclasPeriodo: EstructuraPdfBanco['anclasPeriodo'],
): { desde: string; hasta: string } | undefined {
  const mDesde = textoCompleto.match(anclasPeriodo.desde);
  const mHasta = textoCompleto.match(anclasPeriodo.hasta);
  if (!mDesde?.[1] || !mHasta?.[1]) return undefined;
  return { desde: mDesde[1], hasta: mHasta[1] };
}

/**
 * Convierte una fecha cruda del período (`DD/MM/YYYY` o `DD-MM-YYYY` — los
 * únicos dos separadores que usan los 4 bancos para el período, distinto del
 * `formatoFecha` de las filas) a ISO `YYYY-MM-DD`.
 */
export function periodoAIso(fechaCruda: string): string {
  const [dia, mes, anio] = fechaCruda.split(/[/-]/);
  return `${anio}-${mes}-${dia}`;
}

/**
 * Página (1-indexada) del primer token, en orden de página ascendente, que
 * matchea alguna ancla de encabezado. Fallback conservador: página 1 si
 * ninguna ancla matchea (no debería ocurrir si `evaluarEstructura` ya validó
 * que las anclas están presentes).
 */
export function paginaInicioTabla(
  tokens: PagedTokens,
  anclasEncabezado: ReadonlyArray<string>,
): number {
  const ordenados = [...tokens].sort((a, b) => a.page - b.page);
  for (const token of ordenados) {
    if (
      anclasEncabezado.some((ancla) => coincideAnclaEnToken([token], ancla))
    ) {
      return token.page;
    }
  }
  return 1;
}

/**
 * evaluarEstructura — decisión central de Track B (US-009):
 *
 *   1. Encabezados faltantes → `ProblemaEstructuraPdf[]` (AnclaFaltante).
 *   2. Período (si el banco lo requiere — `fuenteAnio.kind !== 'explicito'`):
 *      - Falta Y ya hay problemas de encabezado → se agrega `PeriodoFaltante`
 *        a la MISMA lista y se retorna `EstructuraPdfInvalidaError` con TODO
 *        junto (PDF-02 escenario "múltiples problemas").
 *      - Falta y NO hay otros problemas → `RangoFechasInvalidoError` standalone
 *        (PDF-02 escenario "ancla de período ausente").
 *   3. BCI (`fuenteAnio.kind === 'explicito'`) NO exige período — puede ser
 *      `Result.ok` con `periodo: undefined`.
 *   4. Todo OK → `Result.ok(EstructuraPdfValidada)`.
 */
export function evaluarEstructura(
  tokens: PagedTokens,
  estructura: EstructuraPdfBanco,
  banco: BancoConocido,
): Result<
  EstructuraPdfValidada,
  EstructuraPdfInvalidaError | RangoFechasInvalidoError
> {
  const problemas: ProblemaEstructuraPdf[] = detectarAnclasFaltantes(
    tokens,
    estructura.anclasEncabezado,
  ).map((ancla) => ({ tipo: 'AnclaFaltante' as const, ancla }));

  const textoCompleto = construirTextoCompleto(tokens);
  const periodoCrudo = extraerPeriodo(textoCompleto, estructura.anclasPeriodo);
  const periodoRequerido = estructura.fuenteAnio.kind !== 'explicito';

  if (!periodoCrudo && periodoRequerido) {
    if (problemas.length > 0) {
      return Result.fail(
        new EstructuraPdfInvalidaError(banco, [
          ...problemas,
          { tipo: 'PeriodoFaltante' },
        ]),
      );
    }
    return Result.fail(new RangoFechasInvalidoError(banco));
  }

  if (problemas.length > 0) {
    return Result.fail(new EstructuraPdfInvalidaError(banco, problemas));
  }

  return Result.ok({
    banco,
    periodo: periodoCrudo
      ? {
          desde: periodoAIso(periodoCrudo.desde),
          hasta: periodoAIso(periodoCrudo.hasta),
        }
      : undefined,
    paginaInicioTabla: paginaInicioTabla(tokens, estructura.anclasEncabezado),
    rangosX: estructura.rangosX,
    toleranciaY: estructura.toleranciaY,
  });
}
