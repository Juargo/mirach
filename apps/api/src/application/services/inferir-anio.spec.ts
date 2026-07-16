import { inferirAnios } from './inferir-anio';

describe('inferirAnios', () => {
  it('retorna un arreglo vacío para un arreglo de meses vacío', () => {
    expect(inferirAnios([], 2026)).toEqual([]);
  });

  it('un solo mes usa el año inicial', () => {
    expect(inferirAnios([4], 2026)).toEqual([2026]);
  });

  it('meses ascendentes dentro del mismo año no incrementan el año', () => {
    expect(inferirAnios([3, 4, 5], 2026)).toEqual([2026, 2026, 2026]);
  });

  it('meses repetidos (varios movimientos el mismo mes) no incrementan el año', () => {
    expect(inferirAnios([3, 3, 3], 2026)).toEqual([2026, 2026, 2026]);
  });

  it('cruce de diciembre a enero incrementa el año, y el resto de la fila queda en el año nuevo', () => {
    expect(inferirAnios([11, 12, 1, 2], 2025)).toEqual([
      2025, 2025, 2026, 2026,
    ]);
  });

  it('un statement que empieza y termina en el mismo mes de diciembre a enero (borde exacto)', () => {
    expect(inferirAnios([12, 1], 2025)).toEqual([2025, 2026]);
  });

  it('cruce real de año sin movimientos en diciembre (noviembre a enero) también incrementa el año', () => {
    expect(inferirAnios([11, 1], 2025)).toEqual([2025, 2026]);
  });

  it('múltiples cruces de año en un mismo arreglo incrementan el año en cada uno', () => {
    expect(inferirAnios([11, 12, 1, 2, 12, 1], 2024)).toEqual([
      2024, 2024, 2025, 2025, 2025, 2026,
    ]);
  });

  it('documenta el contrato: el helper asume orden cronológico ascendente en la entrada — ' +
    'una entrada que lo viola (ej. un decremento a mitad de año, [6, 3]) igual sigue la ' +
    'regla "cualquier decremento = cruce de año" y produce un resultado indefinido-pero-documentado', () => {
    expect(inferirAnios([6, 3], 2026)).toEqual([2026, 2027]);
  });
});
