import { Categoria, CATEGORIA_BUCKET, bucketDeCategoria } from './categoria';
import { Bucket } from './bucket';

describe('CATEGORIA_BUCKET — mapa total categoría → bucket (CAT-01)', () => {
  it('cubre exactamente las 8 categorías de la taxonomía FINAL', () => {
    const categorias = Object.values(Categoria);
    expect(categorias).toHaveLength(8);
    expect(Object.keys(CATEGORIA_BUCKET)).toHaveLength(8);
  });

  it('cada categoría resuelve a exactamente un bucket (mapa total, sin huérfanas)', () => {
    for (const categoria of Object.values(Categoria)) {
      expect(CATEGORIA_BUCKET[categoria]).toBeDefined();
      expect(Object.values(Bucket)).toContain(CATEGORIA_BUCKET[categoria]);
    }
  });

  it.each([
    [Categoria.Supermercado, Bucket.Necesidades],
    [Categoria.Combustible, Bucket.Necesidades],
    [Categoria.Farmacia, Bucket.Necesidades],
    [Categoria.Salud, Bucket.Necesidades],
    [Categoria.Transporte, Bucket.Necesidades],
    [Categoria.Streaming, Bucket.Deseos],
    [Categoria.Delivery, Bucket.Deseos],
    [Categoria.Ahorro, Bucket.Ahorro],
  ])('%s → %s', (categoria, bucketEsperado) => {
    expect(CATEGORIA_BUCKET[categoria]).toBe(bucketEsperado);
    expect(bucketDeCategoria(categoria)).toBe(bucketEsperado);
  });
});
