/**
 * CategoriaFueraDeCatalogoError — error de dominio.
 *
 * Se produce cuando una edición del overlay de commit especifica un `categoriaId`
 * que NO pertenece al catálogo propio del usuario (scoped by `userId`, ADR-036).
 * Esto incluye el intento de usar el id de una categoría de otro usuario
 * (cruce de tenants, RNF-SEC-006).
 *
 * La validación de pertenencia usa `ICategoriaRepository.listarConPatrones(userId)`
 * (el set autoritativo de todas las categorías propias, incluyendo las que no tienen
 * patrones) en lugar de `ICatalogoClasificacion.findAll` (que solo retorna las que
 * tienen al menos un patrón, D-10).
 *
 * El mensaje es una CONSTANTE de compilación: NO interpola el `categoriaId` ni
 * ningún dato del request (ADR-013, misma doctrina que RowIndexFueraDeRangoError).
 * El `categoriaId` rechazado se conserva como propiedad para logging/diagnóstico,
 * pero nunca alcanza `.message` (que termina, sin envolver, en respuestas HTTP 400).
 */
export class CategoriaFueraDeCatalogoError extends Error {
  constructor(public readonly categoriaId: string) {
    super(
      'una edición referencia una categoría que no pertenece al catálogo del ' +
        'usuario; verifique que el categoriaId corresponda a una categoría propia',
    );
    this.name = 'CategoriaFueraDeCatalogoError';
  }
}
