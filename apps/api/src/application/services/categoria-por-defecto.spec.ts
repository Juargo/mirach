import {
  BUCKET_POR_DEFECTO,
  seleccionarCategoriaInterna,
  seleccionarCategoriaPorDefecto,
} from './categoria-por-defecto';
import { Bucket } from '../../domain/value-objects/bucket';

describe('seleccionarCategoriaPorDefecto (#778)', () => {
  it('BUCKET_POR_DEFECTO es Deseos', () => {
    expect(BUCKET_POR_DEFECTO).toBe(Bucket.Deseos);
  });

  it('encuentra la categoría interna del bucket por defecto', () => {
    const categorias = [
      {
        id: 'cat-desconocido-deseos',
        nombre: 'Desconocido',
        bucket: Bucket.Deseos,
        esInterna: true,
      },
    ];

    const resultado = seleccionarCategoriaPorDefecto(categorias);

    expect(resultado).toEqual({
      id: 'cat-desconocido-deseos',
      nombre: 'Desconocido',
    });
  });

  it('ignora una categoría del bucket correcto que NO es interna (esInterna: false)', () => {
    const categorias = [
      {
        id: 'cat-usuario-deseos',
        nombre: 'Gustos personales',
        bucket: Bucket.Deseos,
        esInterna: false,
      },
    ];

    expect(seleccionarCategoriaPorDefecto(categorias)).toBeNull();
  });

  it('ignora una categoría interna de OTRO bucket (Necesidades/Ahorro)', () => {
    const categorias = [
      {
        id: 'cat-desconocido-necesidades',
        nombre: 'Desconocido',
        bucket: Bucket.Necesidades,
        esInterna: true,
      },
      {
        id: 'cat-desconocido-ahorro',
        nombre: 'Desconocido',
        bucket: Bucket.Ahorro,
        esInterna: true,
      },
    ];

    expect(seleccionarCategoriaPorDefecto(categorias)).toBeNull();
  });

  it('devuelve null si la lista está vacía', () => {
    expect(seleccionarCategoriaPorDefecto([])).toBeNull();
  });

  it('devuelve la primera coincidencia en orden de entrada si hubiera más de una (no lanza)', () => {
    const categorias = [
      {
        id: 'cat-primera',
        nombre: 'Desconocido',
        bucket: Bucket.Deseos,
        esInterna: true,
      },
      {
        id: 'cat-segunda',
        nombre: 'Desconocido duplicada',
        bucket: Bucket.Deseos,
        esInterna: true,
      },
    ];

    expect(seleccionarCategoriaPorDefecto(categorias)).toEqual({
      id: 'cat-primera',
      nombre: 'Desconocido',
    });
  });
});

describe('seleccionarCategoriaInterna (#778 tramo 3)', () => {
  it('encuentra la Desconocido del bucket PEDIDO, no de BUCKET_POR_DEFECTO', () => {
    const categorias = [
      {
        id: 'cat-desconocido-necesidades',
        nombre: 'Desconocido',
        bucket: Bucket.Necesidades,
        esInterna: true,
      },
      {
        id: 'cat-desconocido-deseos',
        nombre: 'Desconocido',
        bucket: Bucket.Deseos,
        esInterna: true,
      },
    ];

    expect(seleccionarCategoriaInterna(categorias, Bucket.Necesidades)).toEqual(
      { id: 'cat-desconocido-necesidades', nombre: 'Desconocido' },
    );
  });

  it('ignora una categoría del bucket pedido que NO es interna (esInterna: false)', () => {
    const categorias = [
      {
        id: 'cat-usuario-necesidades',
        nombre: 'Comida casera',
        bucket: Bucket.Necesidades,
        esInterna: false,
      },
    ];

    expect(
      seleccionarCategoriaInterna(categorias, Bucket.Necesidades),
    ).toBeNull();
  });

  it('ignora una categoría interna de OTRO bucket', () => {
    const categorias = [
      {
        id: 'cat-desconocido-ahorro',
        nombre: 'Desconocido',
        bucket: Bucket.Ahorro,
        esInterna: true,
      },
    ];

    expect(
      seleccionarCategoriaInterna(categorias, Bucket.Necesidades),
    ).toBeNull();
  });

  it('devuelve null si la lista está vacía', () => {
    expect(seleccionarCategoriaInterna([], Bucket.Necesidades)).toBeNull();
  });

  it('seleccionarCategoriaPorDefecto delega en seleccionarCategoriaInterna con BUCKET_POR_DEFECTO', () => {
    const categorias = [
      {
        id: 'cat-desconocido-deseos',
        nombre: 'Desconocido',
        bucket: Bucket.Deseos,
        esInterna: true,
      },
      {
        id: 'cat-desconocido-necesidades',
        nombre: 'Desconocido',
        bucket: Bucket.Necesidades,
        esInterna: true,
      },
    ];

    expect(seleccionarCategoriaPorDefecto(categorias)).toEqual(
      seleccionarCategoriaInterna(categorias, BUCKET_POR_DEFECTO),
    );
  });
});
