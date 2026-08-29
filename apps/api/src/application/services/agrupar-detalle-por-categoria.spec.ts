import { agruparDetallePorCategoria } from './agrupar-detalle-por-categoria';
import { DetalleBucketRow } from '../ports/detalle-bucket.port';

// ──────────────────────────────────────────────────────────────────────────────
// US-051 PR1: Unit tests — agruparDetallePorCategoria (pure grouping service,
// D-03). Mirrors the web helper `agrupar-detalle-por-categoria.ts` semantics
// (US-013 WCAT-02) on the backend BigInt rows: group key `categoriaId`,
// subtotal = Σ cargo, es-CL alpha, "Sin categoría" LAST, reader order kept,
// empty → []. 10 cases per design §4 ledger (as amended by tasks.md 1.1).
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

/** Fila ya foldeada por `foldCategoria` (US-017): categoria = {id, nombre} o null. */
const conCategoria = (id: string, nombre: string) => ({ id, nombre });

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

  it('ordena los grupos alfabéticamente es-CL con "Sin categoría" SIEMPRE al final', () => {
    const filas = [
      makeRow({
        id: 'tx-1',
        categoria: conCategoria('cat-zapateria', 'Zapatería'),
      }),
      makeRow({ id: 'tx-2', categoria: conCategoria('cat-noquis', 'Ñoquis') }),
      makeRow({ id: 'tx-3', categoria: null }),
    ];

    const grupos = agruparDetallePorCategoria(filas);

    expect(grupos.map((g) => g.nombre)).toEqual([
      'Ñoquis',
      'Zapatería',
      NOMBRE_SIN_CATEGORIA,
    ]);
  });

  it('colación con tildes/ñ bajo locale EXPLÍCITO es-CL (acento como diferencia terciaria)', () => {
    // En es-CL, "Águila" ordena junto a la "a" (antes de "Zapatería"): el
    // acento es diferencia terciaria, no codepoint. Sin locale explícito el
    // orden cambiaría entre runtimes (web helper design.md §1/Q7b).
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

  it('preserva el orden del reader dentro de cada grupo (fecha asc, id asc — no re-ordena)', () => {
    // El reader ya entrega fecha asc, id asc; el servicio NO debe re-sortear.
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
