import { agruparDetallePorCategoria } from './agrupar-detalle-por-categoria';
import { DetalleBucketRow } from '../ports/detalle-bucket.port';

// ──────────────────────────────────────────────────────────────────────────────
// US-051 PR1: Unit tests — agruparDetallePorCategoria (pure grouping service,
// D-03) on the backend BigInt rows: group key `categoriaId`, subtotal = Σ
// cargo, "Sin categoría" LAST, reader order kept, empty → [].
//
// 2026-09-17: group order is by SUBTOTAL DESC, with the es-CL name only as a
// tie-break. The alpha cases that predate this change still pass — their rows
// share the default `cargo`, so their subtotals tie and the name decides —
// but they now cover the TIE-BREAK, not the primary order. Their titles say
// so; do not read them as pinning alphabetical order.
// ──────────────────────────────────────────────────────────────────────────────

const NOMBRE_SIN_CATEGORIA = 'Sin categoría';

const makeRow = (
  overrides: Partial<DetalleBucketRow> = {},
): DetalleBucketRow => ({
  id: 'tx-001',
  fecha: new Date('2026-07-03T00:00:00.000Z'),
  descripcion: 'Compra supermercado',
  cargo: 50000n,
  abono: 0n,
  banco: 'BCI',
  tipoCuenta: 'Cuenta Corriente',
  numeroCuenta: '12345678',
  categoria: null,
  ...overrides,
});

/**
 * Fila ya foldeada por `foldCategoria` (US-017): categoria = {id, nombre,
 * icono} o null. `icono` default `null` (categoria-iconografia MBD-02): la
 * mayoría de los tests de este archivo no le interesa el icono.
 */
const conCategoria = (
  id: string,
  nombre: string,
  icono: string | null = null,
) => ({ id, nombre, icono });

describe('agruparDetallePorCategoria', () => {
  it('agrupa por categoriaId con subtotal (Σ cargo) y conteo correctos', () => {
    const filas = [
      makeRow({
        id: 'tx-1',
        cargo: 90000n,
        categoria: conCategoria('cat-comida', 'Comida'),
      }),
      makeRow({
        id: 'tx-2',
        cargo: 60000n,
        categoria: conCategoria('cat-comida', 'Comida'),
      }),
      makeRow({
        id: 'tx-3',
        cargo: 40000n,
        categoria: conCategoria('cat-transporte', 'Transporte'),
      }),
    ];

    const grupos = agruparDetallePorCategoria(filas);

    expect(grupos).toHaveLength(2);
    const comida = grupos.find((g) => g.categoriaId === 'cat-comida');
    const transporte = grupos.find((g) => g.categoriaId === 'cat-transporte');
    expect(comida).toBeDefined();
    expect(transporte).toBeDefined();
    expect(comida?.subtotal).toBe(150000n);
    expect(comida?.conteo).toBe(2);
    expect(transporte?.subtotal).toBe(40000n);
    expect(transporte?.conteo).toBe(1);
  });

  it('gate PR1 (MBD-08/ADR-015): las transacciones del grupo son la proyección recortada {id, fecha, descripcion, origen, monto} — sin PII de cuenta (tipoCuenta/numeroCuenta)', () => {
    const filas = [
      makeRow({
        id: 'tx-1',
        cargo: 90000n,
        categoria: conCategoria('cat-comida', 'Comida'),
      }),
      makeRow({
        id: 'tx-2',
        cargo: 60000n,
        categoria: conCategoria('cat-comida', 'Comida'),
      }),
    ];

    const grupos = agruparDetallePorCategoria(filas);

    expect(grupos[0].transacciones[0]).toEqual({
      id: 'tx-1',
      fecha: new Date('2026-07-03T00:00:00.000Z'),
      descripcion: 'Compra supermercado',
      origen: 'BCI',
      monto: 90000n,
    });
    // La PII de CUENTA del row de entrada (tipoCuenta/numeroCuenta) jamás
    // llega al output — el stringify es solo para inspeccionar claves, no el
    // wire. `banco` SÍ sobrevive, pero solo como el valor de `origen`
    // (D-02): es la señal `esManual` que WEB-DEL-01 necesita, no PII.
    const serialized = JSON.stringify(grupos, (_clave, valor) =>
      typeof valor === 'bigint' ? valor.toString() : valor,
    );
    expect(serialized).not.toContain('tipoCuenta');
    expect(serialized).not.toContain('numeroCuenta');
    expect(serialized).not.toContain('Cuenta Corriente');
    expect(serialized).not.toContain('12345678');
  });

  it('D-02: origen = fila.banco verbatim; banco vacío (rama Manual dead-code en prod) cae a "Manual"', () => {
    const filas = [
      makeRow({ id: 'tx-1', banco: 'Santander' }),
      makeRow({ id: 'tx-2', banco: '' }),
    ];

    const grupos = agruparDetallePorCategoria(filas);

    const porId = new Map(grupos[0].transacciones.map((t) => [t.id, t.origen]));
    expect(porId.get('tx-1')).toBe('Santander');
    expect(porId.get('tx-2')).toBe('Manual');
  });

  it('filas con categoria null caen en el grupo sintético "Sin categoría" (categoriaId null)', () => {
    const filas = [
      makeRow({ id: 'tx-1', cargo: 40000n, categoria: null }),
      makeRow({ id: 'tx-2', cargo: 60000n, categoria: null }),
    ];

    const grupos = agruparDetallePorCategoria(filas);

    expect(grupos).toHaveLength(1);
    const sintetico = grupos[0];
    expect(sintetico.categoriaId).toBeNull();
    expect(sintetico.nombre).toBe(NOMBRE_SIN_CATEGORIA);
    expect(sintetico.subtotal).toBe(100000n);
    expect(sintetico.conteo).toBe(2);
    expect(sintetico.transacciones.map((t) => t.id)).toEqual(['tx-1', 'tx-2']);
  });

  it('suma exacta en BigInt más allá de Number.MAX_SAFE_INTEGER, sin perder dígitos', () => {
    const masAllaDeMaxSafe = 9007199254740993n; // MAX_SAFE_INTEGER + 1
    const filas = [
      makeRow({
        id: 'tx-1',
        cargo: masAllaDeMaxSafe,
        categoria: conCategoria('cat-a', 'A'),
      }),
      makeRow({
        id: 'tx-2',
        cargo: masAllaDeMaxSafe,
        categoria: conCategoria('cat-a', 'A'),
      }),
    ];

    const grupos = agruparDetallePorCategoria(filas);

    expect(grupos[0].subtotal).toBe(18014398509481986n);
    expect(grupos[0].subtotal.toString()).toBe('18014398509481986');
  });

  it('ordena los grupos por SUBTOTAL descendente — el que más gastó primero', () => {
    const filas = [
      makeRow({
        id: 'tx-1',
        cargo: 10_000n,
        categoria: conCategoria('cat-cafe', 'Café'),
      }),
      makeRow({
        id: 'tx-2',
        cargo: 900_000n,
        categoria: conCategoria('cat-arriendo', 'Arriendo'),
      }),
      makeRow({
        id: 'tx-3',
        cargo: 120_000n,
        categoria: conCategoria('cat-super', 'Supermercado'),
      }),
    ];

    const grupos = agruparDetallePorCategoria(filas);

    // Alfabéticamente sería Arriendo · Café · Supermercado, así que este
    // orden solo puede venir del subtotal: el assert no puede pasar bajo el
    // comparador alfabético anterior.
    expect(grupos.map((g) => g.nombre)).toEqual([
      'Arriendo',
      'Supermercado',
      'Café',
    ]);
    expect(grupos.map((g) => g.subtotal)).toEqual([
      900_000n,
      120_000n,
      10_000n,
    ]);
  });

  it('el subtotal manda sobre el nombre incluso con montos más allá de Number.MAX_SAFE_INTEGER', () => {
    // El comparador compara bigint con `>`/`<`. Si alguien lo reescribiera
    // como `Number(a.subtotal - b.subtotal)`, estos dos montos colapsarían al
    // MISMO double y el orden quedaría al azar del nombre.
    const filas = [
      makeRow({
        id: 'tx-1',
        cargo: 9_007_199_254_740_993n,
        categoria: conCategoria('cat-a', 'Aaa'),
      }),
      makeRow({
        id: 'tx-2',
        cargo: 9_007_199_254_740_995n,
        categoria: conCategoria('cat-z', 'Zzz'),
      }),
    ];

    const grupos = agruparDetallePorCategoria(filas);

    expect(grupos.map((g) => g.nombre)).toEqual(['Zzz', 'Aaa']);
  });

  it('"Sin categoría" queda al final AUNQUE sea el grupo de mayor subtotal', () => {
    const filas = [
      makeRow({
        id: 'tx-1',
        cargo: 1_000n,
        categoria: conCategoria('cat-cafe', 'Café'),
      }),
      makeRow({ id: 'tx-2', cargo: 5_000_000n, categoria: null }),
    ];

    // Es el resto por clasificar, no una decisión de gasto: si se mezclara
    // por monto taparía las categorías reales justo en los meses con mucho
    // sin clasificar.
    //
    // Se afirma con las filas EN LOS DOS ÓRDENES de entrada, y no es
    // ceremonia: `compararGrupos` tiene dos ramas simétricas para "Sin
    // categoría" (una por argumento), y V8 decide con qué orden de
    // argumentos llamar al comparador. Probado por mutación — neutralizando
    // SOLO la rama de `b`, la versión de una sola dirección de este caso
    // seguía verde. Con las dos direcciones, no hay rama que se pueda
    // borrar sin que esto se ponga rojo.
    expect(agruparDetallePorCategoria(filas).map((g) => g.nombre)).toEqual([
      'Café',
      NOMBRE_SIN_CATEGORIA,
    ]);
    expect(
      agruparDetallePorCategoria([...filas].reverse()).map((g) => g.nombre),
    ).toEqual(['Café', NOMBRE_SIN_CATEGORIA]);
  });

  it('con subtotales IGUALES desempata alfabéticamente es-CL, con "Sin categoría" SIEMPRE al final', () => {
    // Las tres filas comparten el `cargo` por defecto, así que el subtotal
    // empata y el desempate por nombre es lo ÚNICO que decide. Ese empate es
    // deliberado: sin desempate el orden de dos categorías con el mismo
    // gasto dependería del orden de inserción del Map y la lista bailaría
    // entre requests.
    const filas = [
      makeRow({
        id: 'tx-1',
        categoria: conCategoria('cat-zapateria', 'Zapatería'),
      }),
      makeRow({ id: 'tx-2', categoria: conCategoria('cat-noquis', 'Ñoquis') }),
      makeRow({ id: 'tx-3', categoria: null }),
    ];

    const grupos = agruparDetallePorCategoria(filas);

    expect(new Set(grupos.map((g) => g.subtotal)).size).toBe(1);
    expect(grupos.map((g) => g.nombre)).toEqual([
      'Ñoquis',
      'Zapatería',
      NOMBRE_SIN_CATEGORIA,
    ]);
  });

  it('el desempate usa colación con tildes/ñ bajo locale EXPLÍCITO es-CL (acento como diferencia terciaria)', () => {
    // En es-CL, "Águila" ordena junto a la "a" (antes de "Zapatería"): el
    // acento es diferencia terciaria, no codepoint. Sin locale explícito el
    // orden cambiaría entre runtimes (web helper design.md §1/Q7b).
    //
    // Las dos filas comparten el `cargo` por defecto: el empate de subtotal
    // es lo que hace que este caso mida la COLACIÓN y no el monto.
    const filas = [
      makeRow({
        id: 'tx-1',
        categoria: conCategoria('cat-zapateria', 'Zapatería'),
      }),
      makeRow({ id: 'tx-2', categoria: conCategoria('cat-aguila', 'Águila') }),
    ];

    const grupos = agruparDetallePorCategoria(filas);

    expect(grupos.map((g) => g.nombre)).toEqual(['Águila', 'Zapatería']);
  });

  it('una categoría llamada literalmente "Sin categoría" ordena al final (edge aceptado)', () => {
    const filas = [
      makeRow({ id: 'tx-1', categoria: conCategoria('cat-comida', 'Comida') }),
      makeRow({
        id: 'tx-2',
        categoria: conCategoria('cat-sin', 'Sin categoría'),
      }),
      makeRow({ id: 'tx-3', categoria: null }),
    ];

    const grupos = agruparDetallePorCategoria(filas);

    // Ambos grupos "Sin categoría" (el sintético y el real) van al final;
    // el resto queda alfabético antes.
    expect(grupos.map((g) => g.nombre)).toEqual([
      'Comida',
      'Sin categoría',
      'Sin categoría',
    ]);
    expect(grupos[1].categoriaId).toBe('cat-sin');
    expect(grupos[2].categoriaId).toBeNull();
  });

  it('solo produce grupos de categorías presentes — nunca grupos vacíos', () => {
    const filas = [
      makeRow({ id: 'tx-1', categoria: conCategoria('cat-comida', 'Comida') }),
      makeRow({ id: 'tx-2', categoria: conCategoria('cat-comida', 'Comida') }),
    ];

    const grupos = agruparDetallePorCategoria(filas);

    expect(grupos).toHaveLength(1);
    expect(grupos[0].categoriaId).toBe('cat-comida');
    expect(grupos[0].conteo).toBe(2);
  });

  it('entrada vacía → []', () => {
    expect(agruparDetallePorCategoria([])).toEqual([]);
  });

  it('preserva el orden en que llegan las filas dentro de cada grupo — no re-ordena', () => {
    // El servicio NO re-sortea las transacciones: el orden de las filas lo
    // decide el `orderBy` del reader en SQL (desde 2026-09-17: monto desc,
    // fecha asc, id asc — fijado en `prisma-detalle-bucket.repository.spec`).
    // Este caso usa un orden arbitrario a propósito, para probar que se
    // respeta tal cual venga, sea el que sea.
    const filas = [
      makeRow({
        id: 'tx-3',
        fecha: new Date('2026-07-21T00:00:00.000Z'),
        categoria: conCategoria('cat-comida', 'Comida'),
      }),
      makeRow({
        id: 'tx-1',
        fecha: new Date('2026-07-03T00:00:00.000Z'),
        categoria: conCategoria('cat-comida', 'Comida'),
      }),
      makeRow({
        id: 'tx-2',
        fecha: new Date('2026-07-15T00:00:00.000Z'),
        categoria: conCategoria('cat-comida', 'Comida'),
      }),
    ];

    const grupos = agruparDetallePorCategoria(filas);

    expect(grupos[0].transacciones.map((t) => t.id)).toEqual([
      'tx-3',
      'tx-1',
      'tx-2',
    ]);
  });

  it('el grupo expone el icono de la categoría (categoria-iconografia MBD-02)', () => {
    const filas = [
      makeRow({
        id: 'tx-1',
        categoria: conCategoria('cat-transporte', 'Transporte', 'bus'),
      }),
    ];

    const grupos = agruparDetallePorCategoria(filas);

    expect(grupos[0].icono).toBe('bus');
  });

  it('una categoría sin icono propio (icono null) expone icono null en su grupo', () => {
    const filas = [
      makeRow({
        id: 'tx-1',
        categoria: conCategoria('cat-sin-icono', 'Mascotas', null),
      }),
    ];

    const grupos = agruparDetallePorCategoria(filas);

    expect(grupos[0].icono).toBeNull();
  });

  it('el grupo sintético "Sin categoría" SIEMPRE expone icono null, sin importar el icono de otras categorías (MBD-02)', () => {
    const filas = [
      makeRow({
        id: 'tx-1',
        categoria: conCategoria('cat-transporte', 'Transporte', 'bus'),
      }),
      makeRow({ id: 'tx-2', categoria: null }),
    ];

    const grupos = agruparDetallePorCategoria(filas);

    const sintetico = grupos.find((g) => g.categoriaId === null);
    expect(sintetico?.icono).toBeNull();
  });

  it('subtotal = Σ cargo únicamente — los abonos jamás entran al subtotal', () => {
    const filas = [
      makeRow({
        id: 'tx-1',
        cargo: 50000n,
        abono: 30000n,
        categoria: conCategoria('cat-a', 'A'),
      }),
      makeRow({
        id: 'tx-2',
        cargo: 70000n,
        abono: 900000n,
        categoria: conCategoria('cat-a', 'A'),
      }),
    ];

    const grupos = agruparDetallePorCategoria(filas);

    expect(grupos[0].subtotal).toBe(120000n);
    expect(grupos[0].subtotal).not.toBe(1050000n);
  });
});
