package app.mirachbudget.android.features.categorias

import app.mirachbudget.android.core.networking.CategoriaCatalogo

/**
 * The words of "Categorías", verbatim from iOS (`CategoriasView` and `CategoriasPresentation`):
 * what a row says and what TalkBack reads.
 */
object CategoriasMessages {
    const val TITLE = "Categorías"
    const val NEW_CATEGORY = "Nueva categoría"
    const val LOADING = "Cargando categorías…"
    const val RETRY = "Reintentar"
    const val NO_CATEGORIES = "Sin categorías"
    const val EMPTY = "Todavía no tienes categorías. Crea tu primera categoría para empezar a clasificar tus movimientos."
    const val CANCEL = "Cancelar"
    const val REFRESH_FAILED = "No se pudo actualizar la lista."
    const val CHANGE_APPLIED_REFRESH_FAILED =
        "El cambio se aplicó, pero no pudimos actualizar la lista. Desliza hacia abajo para actualizar."
    /** The creation form is the review's (`SubirCartolaMessages.FORM_*`) plus this icon section, as on iOS. */
    const val FORM_ICON = "Ícono (opcional)"
    const val NO_ICON = "Sin ícono"

    fun loadFailure(failure: CategoriasViewModel.Failure): String = when (failure) {
        CategoriasViewModel.Failure.Connection -> "Problema de conexión. Revisa tu conexión e inténtalo de nuevo."
        CategoriasViewModel.Failure.Server -> "No pudimos cargar las categorías. Inténtalo de nuevo en unos segundos."
    }

    fun created(nombre: String) = "Categoría «$nombre» creada"

    fun deleted(nombre: String) = "Categoría «$nombre» eliminada"

    fun movements(count: Int): String = if (count == 1) "1 movimiento" else "$count movimientos"

    fun patterns(count: Int): String = if (count == 1) "1 patrón" else "$count patrones"

    /** «12 movimientos · 2 patrones» */
    fun counts(category: CategoriaCatalogo): String = "${movements(category.transaccionesCount)} · ${patterns(category.patrones.size)}"

    fun rowLabel(category: CategoriaCatalogo): String {
        val label = "${category.nombre}. ${movements(category.transaccionesCount)}. ${patterns(category.patrones.size)}"
        return if (category.esInterna) "$label. Categoría del sistema" else label
    }
}
