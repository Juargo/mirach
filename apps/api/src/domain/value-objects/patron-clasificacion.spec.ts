import { PatronClasificacion } from './patron-clasificacion';
import { Bucket } from './bucket';

const CATEGORIA_SUPERMERCADO = {
  id: 'cat-supermercado',
  nombre: 'Supermercado',
  bucket: Bucket.Necesidades,
};
const CATEGORIA_STREAMING = {
  id: 'cat-streaming',
  nombre: 'Streaming',
  bucket: Bucket.Deseos,
};

function makePatron(
  patron: string,
  matchType: PatronClasificacion['matchType'],
  categoria = CATEGORIA_SUPERMERCADO,
): PatronClasificacion {
  return new PatronClasificacion({
    id: 'p1',
    patron,
    matchType,
    categoria,
    prioridad: 10,
  });
}

describe('PatronClasificacion — CONTAINS', () => {
  it('devuelve true cuando la descripción contiene el patrón (mismo case)', () => {
    const p = makePatron('LIDER', 'CONTAINS');
    expect(p.coincide('COMPRA LIDER SAN PABLO')).toBe(true);
  });

  it('es insensible a mayúsculas: descripción en MAYÚSCULAS, patrón en minúsculas', () => {
    const p = makePatron('netflix', 'CONTAINS', CATEGORIA_STREAMING);
    expect(p.coincide('SUSCRIPCION NETFLIX')).toBe(true);
  });

  it('devuelve false cuando el patrón NO aparece como substring', () => {
    const p = makePatron('jumbo', 'CONTAINS');
    expect(p.coincide('COMPRA LIDER SAN PABLO')).toBe(false);
  });

  it('trim en la descripción no afecta el resultado', () => {
    const p = makePatron('lider', 'CONTAINS');
    expect(p.coincide('  COMPRA LIDER  ')).toBe(true);
  });
});

describe('PatronClasificacion — STARTS_WITH', () => {
  it('devuelve true cuando la descripción empieza con el patrón', () => {
    const p = makePatron('COPEC', 'STARTS_WITH');
    expect(p.coincide('COPEC ESTACION 456')).toBe(true);
  });

  it('es insensible a mayúsculas: descripción en minúsculas, patrón en MAYÚSCULAS', () => {
    const p = makePatron('COPEC', 'STARTS_WITH');
    expect(p.coincide('copec estacion 456')).toBe(true);
  });

  it('devuelve false cuando el patrón aparece en el MEDIO de la descripción (no al inicio)', () => {
    const p = makePatron('COPEC', 'STARTS_WITH');
    expect(p.coincide('PAGO COPEC ESTACION 456')).toBe(false);
  });
});

describe('PatronClasificacion — REGEX', () => {
  it('devuelve true cuando la descripción coincide con la expresión regular (flag i)', () => {
    const p = makePatron('^JUMBO\\s+\\d+', 'REGEX');
    expect(p.coincide('JUMBO 007 LAS CONDES')).toBe(true);
  });

  it('devuelve false cuando la regex NO coincide', () => {
    const p = makePatron('^JUMBO\\s+\\d+', 'REGEX');
    expect(p.coincide('SUPERMERCADO JUMBO')).toBe(false);
  });

  // GUARDRAIL (CA-05, us-038 §9 constraint 4): esta aserción sostiene la
  // garantía runtime de que un patrón REGEX malformado nunca lanza durante
  // categorización — NO debilitar ni eliminar.
  it('devuelve false (no lanza) cuando la regex está malformada', () => {
    const p = makePatron('(', 'REGEX');
    expect(() => p.coincide('cualquier texto')).not.toThrow();
    expect(p.coincide('cualquier texto')).toBe(false);
  });

  it('devuelve false (no lanza) ante input catastrófico potencial', () => {
    // Patrón que podría ser costoso con backtracking pero no debe lanzar
    const p = makePatron('(a+)+$', 'REGEX');
    expect(() => p.coincide('aaaaaaaaaaaaaaaaaaaab')).not.toThrow();
    // El resultado no importa siempre que NO lance
  });
});

describe('PatronClasificacion — expone campos inmutables', () => {
  it('expone los campos correctamente, incluida la categoría anidada', () => {
    const p = new PatronClasificacion({
      id: 'abc',
      patron: 'netflix',
      matchType: 'CONTAINS',
      categoria: CATEGORIA_STREAMING,
      prioridad: 20,
    });
    expect(p.id).toBe('abc');
    expect(p.patron).toBe('netflix');
    expect(p.matchType).toBe('CONTAINS');
    expect(p.categoria).toEqual(CATEGORIA_STREAMING);
    expect(p.bucket).toBe(Bucket.Deseos);
    expect(p.prioridad).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// CAT-02 — `bucket` is DERIVED from `categoria`, never independently settable.
// ADR-037: la categoría ya no es un miembro de un enum cerrado — es una fila
// anidada `{ id, nombre, bucket }`; `bucket` sigue siendo una PROYECCIÓN de
// esa fila, nunca un campo hermano aceptado de forma independiente.
// ---------------------------------------------------------------------------
describe('PatronClasificacion — bucket derivado (CAT-02)', () => {
  it.each([
    { ...CATEGORIA_SUPERMERCADO },
    { ...CATEGORIA_STREAMING },
    { id: 'cat-ahorro', nombre: 'Ahorro', bucket: Bucket.Ahorro },
    { id: 'cat-mascotas', nombre: 'Mascotas', bucket: Bucket.Deseos },
  ])('get bucket() proyecta categoria.bucket para $nombre', (categoria) => {
    const p = new PatronClasificacion({
      id: 'p-derive',
      patron: 'x',
      matchType: 'CONTAINS',
      categoria,
      prioridad: 1,
    });
    expect(p.bucket).toBe(categoria.bucket);
  });

  it('no expone un setter/constructor param independiente para bucket (solo se proyecta de categoria)', () => {
    const categoria = {
      id: 'cat-ahorro',
      nombre: 'Ahorro',
      bucket: Bucket.Ahorro,
    };
    const p = new PatronClasificacion({
      id: 'p-1',
      patron: 'x',
      matchType: 'CONTAINS',
      categoria,
      prioridad: 1,
    });
    // TypeScript ya impide pasar `bucket` como campo hermano suelto en el
    // constructor (ver PatronClasificacionProps); este test documenta en
    // runtime que `bucket` sigue siendo un getter que proyecta `categoria.bucket`.
    expect(p.bucket).toBe(Bucket.Ahorro);
  });
});
