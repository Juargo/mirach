import { PatronClasificacion } from './patron-clasificacion';
import { Bucket } from './bucket';
import { aPatronExistente, buscarPatronPorTexto } from './patron-existente';

const CAFES = { id: 'cat-cafes', nombre: 'Cafés', bucket: Bucket.Deseos };

function patron(id: string, texto: string): PatronClasificacion {
  return new PatronClasificacion({
    id,
    patron: texto,
    matchType: 'CONTAINS',
    categoria: CAFES,
    prioridad: 100,
  });
}

describe('buscarPatronPorTexto (CLA-17, S5)', () => {
  it('folds accents and case: "cafe" collides with "Café"', () => {
    const catalogo = [patron('p-1', 'uber'), patron('p-2', 'Café')];
    expect(buscarPatronPorTexto(catalogo, '  CAFE ')?.id).toBe('p-2');
  });

  it('returns undefined when no pattern holds the text', () => {
    expect(
      buscarPatronPorTexto([patron('p-1', 'uber')], 'cabify'),
    ).toBeUndefined();
  });

  it('a pattern never collides with itself (excluirId)', () => {
    const catalogo = [patron('p-2', 'café')];
    expect(buscarPatronPorTexto(catalogo, 'cafe', 'p-2')).toBeUndefined();
  });

  it('a contained text is not a duplicate', () => {
    expect(
      buscarPatronPorTexto([patron('p-1', 'uber eats')], 'uber'),
    ).toBeUndefined();
  });
});

describe('aPatronExistente', () => {
  it('projects the pattern with its category and bucket', () => {
    expect(aPatronExistente(patron('p-2', 'café'))).toEqual({
      patronId: 'p-2',
      categoriaId: 'cat-cafes',
      categoria: 'Cafés',
      bucket: Bucket.Deseos,
    });
  });
});
