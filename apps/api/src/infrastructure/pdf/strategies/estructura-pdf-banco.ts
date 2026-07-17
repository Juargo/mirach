import { BancoConocido } from '../../../domain/value-objects/nombre-banco';

/** Columnas canónicas que la normalización (PR4) necesita ubicar por posición X. */
export type ColumnaPdf = 'fecha' | 'descripcion' | 'cargo' | 'abono';

/** Rango de X (en puntos PDF) que define una columna canónica de la tabla. */
export interface RangoX {
  readonly col: ColumnaPdf;
  readonly xMin: number;
  readonly xMax: number;
}

/**
 * Formato en que cada banco imprime la fecha de cada movimiento (fila de la
 * tabla) — DISTINTO del formato del período (que se parsea vía `anclasPeriodo`,
 * cada banco con su propio patrón de regex).
 *
 *   DD/Mmm      → "02/Abr" (BancoEstado; mes en español abreviado, sin año)
 *   DD/MM       → "02/04" (Banco de Chile, Santander; sin año)
 *   DD/MM/YYYY  → "02/04/2026" (BCI; año explícito por fila)
 */
export type FormatoFechaPdf = 'DD/Mmm' | 'DD/MM' | 'DD/MM/YYYY';

/**
 * De dónde sale el año de cada movimiento cuando el statement no lo trae
 * explícito en la fila (BancoEstado/Chile/Santander → se infiere a partir del
 * año del inicio del período, con cruce de año vía `inferirAnios`). BCI trae
 * el año en cada fila (`DD/MM/YYYY`) y no necesita inferencia — además, por
 * esto, BCI está exento de exigir el ancla de período para ser válido
 * (`RangoFechasInvalidoError`, ver PdfjsStructureValidatorService).
 */
export type FuenteAnio =
  | { readonly kind: 'inferido'; readonly desde: 'periodo-inicio' }
  | { readonly kind: 'explicito' };

/**
 * EstructuraPdfBanco — metadata estructural de un banco para la cartola PDF:
 * qué anclas de encabezado debe traer, cómo extraer el período (regex con
 * grupo de captura para el valor), en qué rango de X cae cada columna
 * canónica, la tolerancia de Y para agrupar filas (`agruparTokens`), el
 * formato de fecha por fila y las filas a ignorar (saldos, resúmenes,
 * footers de navegador).
 *
 * Cada strategy PDF expone esto vía `getEstructura()` — mismo patrón que
 * `EstructuraBanco` (Excel), para que `PdfjsStructureValidatorService` valide
 * sin acoplarse a ningún banco en particular (design.md Fase 4).
 */
export interface EstructuraPdfBanco {
  readonly banco: BancoConocido;
  /** Anclas de encabezado (página 1 y/o encabezado de tabla) que deben existir. */
  readonly anclasEncabezado: ReadonlyArray<string>;
  /**
   * Regex con UN grupo de captura que extrae, respectivamente, la fecha
   * "desde" y "hasta" del período del statement, aplicadas sobre el texto
   * completo del documento (tokens unidos en orden de lectura). Cada banco
   * tiene su propio patrón porque el layout real difiere (ver comentarios en
   * cada strategy — ej. Santander separa etiqueta y valor en filas distintas).
   */
  readonly anclasPeriodo: { readonly desde: RegExp; readonly hasta: RegExp };
  readonly rangosX: ReadonlyArray<RangoX>;
  readonly toleranciaY: number;
  readonly formatoFecha: FormatoFechaPdf;
  readonly fuenteAnio: FuenteAnio;
  /** Filas a excluir (ej. SALDO INICIAL/FINAL, Resumen de Comisiones, footer de navegador). */
  readonly filasIgnoradas: ReadonlyArray<RegExp>;
  /**
   * Ancla POSICIONAL de fin de tabla — DISTINTA de `filasIgnoradas`.
   * `filasIgnoradas` descarta SOLO la fila que matchea y sigue procesando
   * las siguientes (ej. "SALDO INICIAL" puede ser de las primeras filas de
   * la tabla — truncarla ahí perdería todo el statement). `anclaFinTabla`,
   * en cambio, es el punto donde la tabla de movimientos TERMINA: al
   * encontrar una fila que matchea, se deja de recolectar filas (la fila
   * misma y todo lo que venga después, en orden de lectura, se descarta).
   *
   * Caso de uso: Santander repite la última fila del detalle DESPUÉS de su
   * sección "Resumen de Comisiones" (eco literal, no un movimiento real) —
   * ver santander.strategy.ts. Opcional: los bancos sin este problema
   * simplemente no la definen.
   */
  readonly anclaFinTabla?: RegExp;
  /**
   * Opt-in — SOLO BCI (PR4b) lo activa. Cuando es `true`, una fila SIN fecha
   * interpretable, SIN cargo ni abono propios, pero con texto de
   * descripción, se trata como CONTINUACIÓN MULTILÍNEA de la transacción
   * candidata más reciente (se fusiona como sufijo de su descripción) en vez
   * de descartarse en silencio. Caso real: BCI divide algunas descripciones
   * en 2-3 líneas físicas del PDF (ej. "PAGO CREDITO D00000000001" en una
   * línea, la fila con fecha+monto en la siguiente, "001/012" en la
   * siguiente — ver bci.strategy.ts).
   *
   * Deliberadamente OPT-IN (no el comportamiento por defecto de los otros 3
   * bancos): Santander ya resuelve su merge palabra-por-palabra DENTRO de la
   * misma fila vía `rangosX` (design.md decisión #4, no hay filas
   * multilínea separadas que fusionar); activar esto para BancoEstado/Chile
   * sin necesidad introduciría riesgo de regresión sin beneficio — viola el
   * constraint "un cambio a un banco no debe afectar a los otros".
   */
  readonly fusionarContinuaciones?: boolean;
}
