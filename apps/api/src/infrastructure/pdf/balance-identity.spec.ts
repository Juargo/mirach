import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PdfTextExtractor, PagedTokens } from './pdf-text-extractor';
import { PdfjsTransactionNormalizerService } from './pdfjs-transaction-normalizer.service';
import { parsearMontoPdf } from './parse-monto';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';

/**
 * Identidad de saldos — guard de regresión sobre el parseo de dinero (#629).
 *
 * Asierta la propiedad que toda cartola debe cumplir consigo misma:
 *
 *     saldoAnterior − Σcargo + Σabono === saldoFinal
 *
 * Es la aserción más fuerte que se puede hacer sobre el parseo de montos sin
 * pinnear valor por valor: cruza TRES cosas que el PDF declara por separado
 * (el saldo de apertura, el de cierre, y cada movimiento del detalle). Si una
 * banda de `rangosX` se corre y un monto cae en la columna equivocada, o si
 * una fila se pierde o se duplica, la identidad deja de cerrar. En particular,
 * una INVERSIÓN DE SIGNO —un cargo leído como abono— corre el resultado el
 * doble del monto: es imposible que pase inadvertida.
 *
 * Por qué SOLO Banco de Chile (medido 2026-09-21 sobre los 4 bancos):
 *   - Banco de Chile ✅  Único banco cuyo saldo es hoy legible por el pipeline:
 *     vive en un token propio de las filas "DD/MM SALDO INICIAL" / "DD/MM
 *     SALDO FINAL" que `filasIgnoradas` ya detecta (banco-chile.strategy.ts).
 *     Ambos fixtures reconcilian EXACTO.
 *   - BCI ❌  Ninguna fila con "SALDO" aparece en el texto extraído del
 *     fixture; habría que ubicar primero dónde vive el saldo.
 *   - Santander ❌  "SALDO INICIAL" es el encabezado de una tabla resumen
 *     HORIZONTAL ("SALDO INICIAL  DEPOSITOS  OTROS ABONOS  CHEQUES ..."); los
 *     valores viven en otra fila. Estructura distinta, trabajo aparte.
 *   - BancoEstado ❌  Los saldos existen en el texto ("Saldo Anterior $
 *     15.000" / "Saldo Final $ 29.990") pero el FIXTURE NO CIERRA CONSIGO
 *     MISMO: 15.000 − 125.000 + 130.000 = 20.000 ≠ 29.990. No es inversión de
 *     signo (con los signos al revés daría 10.000) ni error de parseo (el PDF
 *     declara 13 movimientos y se parsean 13). Es un fixture sintético con
 *     números que no cuadran. Incluirlo acá sería un rojo espurio: hay que
 *     regenerar el fixture primero.
 *
 * Este spec NO valida en producción: no rechaza ingestas de usuarios. Es un
 * guard de regresión sobre los fixtures del repo. Llevarlo al pipeline es una
 * decisión aparte — cambia el contrato de `normalizarTransaccionesPdf`, que
 * hoy devuelve solo `ReadonlyArray<Transaccion>`, sin metadata de saldos.
 */

const fixturesDir = join(__dirname, '../../../test/fixtures/pdf');

/** Misma `toleranciaY` que declara `BancoChilePdfStrategy.getEstructura()`. */
const TOLERANCIA_Y = 2;

/**
 * El saldo de Banco de Chile vive FUERA de `rangosX` a propósito (ver el
 * docblock de la strategy), así que no se puede leer con `agruparTokens`: hay
 * que reagrupar por `y` y quedarse con el último token parseable de la fila.
 */
function filasPorY(tokens: PagedTokens): string[][] {
  const filas = new Map<string, { str: string; x: number }[]>();
  for (const t of tokens) {
    const clave = `${t.page}:${Math.round(t.y / TOLERANCIA_Y)}`;
    const fila = filas.get(clave) ?? [];
    fila.push({ str: t.str, x: t.x });
    filas.set(clave, fila);
  }
  return [...filas.values()].map((fila) =>
    [...fila].sort((a, b) => a.x - b.x).map((t) => t.str),
  );
}

/**
 * Anclas idénticas a las `filasIgnoradas` de `BancoChilePdfStrategy`: la fila
 * de saldo es la MISMA que el normalizador descarta. Si la strategy cambia su
 * ancla, este spec deja de encontrar el saldo y falla — que es lo correcto.
 */
const ANCLA_SALDO_INICIAL = /^\d{2}\/\d{2}\s+SALDO INICIAL\b/;
const ANCLA_SALDO_FINAL = /^\d{2}\/\d{2}\s+SALDO FINAL\b/;

function leerSaldos(tokens: PagedTokens): {
  inicial: number | null;
  final: number | null;
} {
  let inicial: number | null = null;
  let final: number | null = null;

  for (const fila of filasPorY(tokens)) {
    const texto = fila.join(' ').trim();
    const esInicial = ANCLA_SALDO_INICIAL.test(texto);
    const esFinal = ANCLA_SALDO_FINAL.test(texto);
    if (!esInicial && !esFinal) continue;

    // El monto es el último token parseable de la fila — a su derecha no hay
    // ninguna otra columna en este banco.
    for (let i = fila.length - 1; i >= 0; i -= 1) {
      const monto = parsearMontoPdf(fila[i]);
      if (monto === null) continue;
      if (esInicial) inicial = monto;
      else final = monto;
      break;
    }
  }

  return { inicial, final };
}

describe('identidad de saldos — Banco de Chile (#629)', () => {
  const extractor = new PdfTextExtractor();
  const normalizer = new PdfjsTransactionNormalizerService();

  const FIXTURES = [
    ['cartola estándar', 'bancochile-cartola-test.pdf'],
    ['cartola de montos grandes', 'bancochile-cartola-montos-grandes-test.pdf'],
  ] as const;

  it.each(FIXTURES)(
    '%s: saldoAnterior − Σcargo + Σabono === saldoFinal',
    async (_nombre, archivo) => {
      const buffer = await readFile(join(fixturesDir, archivo));

      const extraccion = await extractor.extract(buffer, archivo);
      expect(extraccion.isOk()).toBe(true);
      const { inicial, final } = leerSaldos(extraccion.getValue());

      // Que los saldos EXISTAN es parte del contrato: si la strategy cambia su
      // ancla de fila de saldo, esto falla antes que la identidad y dice por qué.
      expect(inicial).not.toBeNull();
      expect(final).not.toBeNull();

      const normalizacion = await normalizer.normalize(
        buffer,
        BancoConocido.BancoChile,
      );
      expect(normalizacion.isOk()).toBe(true);
      const transacciones = normalizacion.getValue();
      expect(transacciones.length).toBeGreaterThan(0);

      const sumaCargo = transacciones.reduce((acc, t) => acc + t.cargo, 0n);
      const sumaAbono = transacciones.reduce((acc, t) => acc + t.abono, 0n);

      const esperado = BigInt(inicial as number) - sumaCargo + sumaAbono;
      expect(esperado).toBe(BigInt(final as number));
    },
  );

  it('las filas de saldo NO se cuelan como movimientos', async () => {
    const archivo = 'bancochile-cartola-test.pdf';
    const buffer = await readFile(join(fixturesDir, archivo));

    const normalizacion = await normalizer.normalize(
      buffer,
      BancoConocido.BancoChile,
    );
    expect(normalizacion.isOk()).toBe(true);

    // `filasIgnoradas` las descarta; si alguien afloja ese filtro, el saldo
    // entraría como movimiento y la identidad de arriba dejaría de cerrar.
    for (const t of normalizacion.getValue()) {
      expect(t.descripcion).not.toMatch(/SALDO (INICIAL|FINAL)/);
    }
  });
});
