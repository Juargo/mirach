import { BancoChilePdfStrategy } from './banco-chile.strategy';
import { BancoEstadoPdfStrategy } from './banco-estado.strategy';
import { BciPdfStrategy } from './bci.strategy';
import { SantanderPdfStrategy } from './santander.strategy';
import { RangoX } from './estructura-pdf-banco';

/**
 * Spec cruzado — Slice 5 (auditoría), design.md D-14, Fase 28.
 *
 * Un único guard mecánico que protege la propiedad de la que depende toda la
 * auditoría de las Fases 26/27: ninguna banda de `rangosX` se solapa con
 * otra, y `cargo`/`abono` (las dos columnas de dinero) son disjuntas. Pasa
 * para los 4 bancos HOY (incluyendo las bandas de BCI recalibradas y el
 * rescate por borde derecho de este change) y falla el día que alguien
 * ensanche una banda hacia su vecina.
 *
 * Deliberadamente NO se agrega una aserción más fuerte de "brecha mínima"
 * entre `cargo` y `abono` — BancoEstado la fallaría hoy (sus bandas son
 * CONTIGUAS, 0pt) y arreglar BancoEstado está fuera de alcance de este
 * change (ver su docblock en `banco-estado.strategy.ts` y el borrador de
 * issue en `openspec/changes/bci-cartola-variante/`). Ese hecho ES el
 * contenido de su hallazgo, no algo que este spec deba silenciar
 * ensanchándose él mismo.
 *
 * Nota sobre la Fase 44 (extensión de este guard, AMENDMENT A-01 / D-14): la
 * aserción "solo BCI, y solo en `cargo`, declara `rescateBordeDerecho`" YA
 * EXISTE — se escribió en Slice 3b (Phase 40) en `../token-grouping.spec.ts`
 * (`describe('agruparTokens — regresión: solo el \`cargo\` de BCI declara
 * rescateBordeDerecho ...')`). Por DRY, la Fase 44 se da por satisfecha ahí
 * — no se duplica un segundo spec cruzado para el mismo hecho.
 */

const RANGOS_POR_BANCO: ReadonlyArray<
  readonly [string, ReadonlyArray<RangoX>]
> = [
  ['BancoEstado', new BancoEstadoPdfStrategy().getEstructura().rangosX],
  ['Banco de Chile', new BancoChilePdfStrategy().getEstructura().rangosX],
  ['Santander', new SantanderPdfStrategy().getEstructura().rangosX],
  ['BCI', new BciPdfStrategy().getEstructura().rangosX],
];

/** [xMin,xMax) semiabierto — mismo criterio que `repartirEnColumnas` (token-grouping.ts). */
function seSolapan(a: RangoX, b: RangoX): boolean {
  return a.xMin < b.xMax && b.xMin < a.xMax;
}

describe('rangosX cruzado — ninguna banda de dinero se solapa entre columnas (D-14, Fase 28)', () => {
  it.each(RANGOS_POR_BANCO)(
    '%s: ninguna banda de rangosX se solapa con otra',
    (_nombre, rangosX) => {
      for (let i = 0; i < rangosX.length; i += 1) {
        for (let j = i + 1; j < rangosX.length; j += 1) {
          expect(seSolapan(rangosX[i], rangosX[j])).toBe(false);
        }
      }
    },
  );

  it.each(RANGOS_POR_BANCO)(
    '%s: `cargo` y `abono` son disjuntas — la propiedad de dinero que importa',
    (_nombre, rangosX) => {
      const cargo = rangosX.find((r) => r.col === 'cargo');
      const abono = rangosX.find((r) => r.col === 'abono');
      expect(cargo).toBeDefined();
      expect(abono).toBeDefined();
      expect(seSolapan(cargo as RangoX, abono as RangoX)).toBe(false);
    },
  );
});
