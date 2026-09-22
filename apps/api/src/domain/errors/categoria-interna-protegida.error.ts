/**
 * CategoriaInternaProtegidaError — error de dominio.
 *
 * Se produce cuando una mutación del catálogo apunta a una categoría marcada
 * como INTERNA (`Categoria.esInterna`). Una categoría interna es parte de la
 * mecánica del producto, no del catálogo que el usuario curó: hoy son las
 * tres `Desconocido` (una por bucket asignable), el lugar donde va a parar un
 * movimiento cuyo grupo se conoce pero cuya categoría no.
 *
 * Borrarlas o renombrarlas dejaría al producto sin ese destino, en silencio y
 * de forma irreversible desde la UI — por eso el rechazo vive en el dominio y
 * no en una guarda de presentación.
 *
 * UNA sola clase para los dos verbos (borrar y editar), porque son el mismo
 * hecho de dominio — "esta fila no es tuya para mutar" — y la invariante
 * "un error ⇒ exactamente un status" se cumple igual: ambos responden `403`.
 * Distinta de `CatalogoDemoSoloLecturaError`, que también es `403` pero
 * describe al SUJETO (una sesión demo no escribe nada); esta describe al
 * OBJETO (esta fila no se muta, la sesión sea cual sea).
 *
 * Distinta de `CategoriaNoEncontradaError`: acá la fila existe y es del
 * caller. No hay riesgo de enumeración que ocultar — el usuario ya sabe que
 * esa categoría es suya, porque la está viendo en su propio catálogo.
 */
export class CategoriaInternaProtegidaError extends Error {
  /** The categoria id, for server-side logging only. */
  readonly categoriaId: string;

  constructor(categoriaId: string) {
    super(
      'Esta categoría es interna del sistema: no se puede editar ni eliminar.',
    );
    this.name = 'CategoriaInternaProtegidaError';
    this.categoriaId = categoriaId;
  }
}
