import { PatronClasificacion } from './patron-clasificacion';
import { Bucket } from './bucket';

function makePatron(
  patron: string,
  matchType: PatronClasificacion['matchType'],
  bucket: Bucket = Bucket.Necesidades,
): PatronClasificacion {
  return new PatronClasificacion({ id: 'p1', patron, matchType, bucket, prioridad: 10 });
}

describe('PatronClasificacion — CONTAINS', () => {
  it('devuelve true cuando la descripción contiene el patrón (mismo case)', () => {
    const p = makePatron('LIDER', 'CONTAINS');
    expect(p.coincide('COMPRA LIDER SAN PABLO')).toBe(true);
  });

  it('es insensible a mayúsculas: descripción en MAYÚSCULAS, patrón en minúsculas', () => {
    const p = makePatron('netflix', 'CONTAINS');
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
  it('expone los campos correctamente', () => {
    const p = new PatronClasificacion({
      id: 'abc',
      patron: 'netflix',
      matchType: 'CONTAINS',
      bucket: Bucket.Deseos,
      prioridad: 20,
    });
    expect(p.id).toBe('abc');
    expect(p.patron).toBe('netflix');
    expect(p.matchType).toBe('CONTAINS');
    expect(p.bucket).toBe(Bucket.Deseos);
    expect(p.prioridad).toBe(20);
  });
});
