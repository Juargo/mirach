package app.mirachbudget.android.features.cartolassubidas

import app.mirachbudget.android.core.formatting.Format
import app.mirachbudget.android.core.networking.CartolaSubida

/**
 * The words of "Cartolas subidas", verbatim from iOS (`CartolasSubidasView` and
 * `CartolasPresentation`): what a row says, the confirmation before deleting and what TalkBack
 * reads. The status is always a word, never only a colour.
 */
object CartolasSubidasMessages {
    const val TITLE = "Cartolas subidas"
    const val LOADING = "Cargando cartolas…"
    const val RETRY = "Reintentar"
    const val EMPTY = "No hay cartolas cargadas. Sube una cartola para poder gestionarla aquí."
    const val UPLOAD = "Subir cartola"
    const val DELETE_TITLE = "¿Eliminar esta cartola?"
    const val DELETE = "Eliminar"
    const val CANCEL = "Cancelar"
    const val DELETING = "Eliminando…"
    const val REFRESH_FAILED = "No se pudo actualizar la lista."

    fun loadFailure(failure: CartolasSubidasViewModel.Failure): String = when (failure) {
        CartolasSubidasViewModel.Failure.Connection -> "Problema de conexión. Revisa tu conexión e inténtalo de nuevo."
        CartolasSubidasViewModel.Failure.Server -> "No pudimos cargar las cartolas. Inténtalo de nuevo en unos segundos."
    }

    fun banco(cartola: CartolaSubida): String = cartola.banco ?: "Banco no identificado"

    fun estado(cartola: CartolaSubida): String = if (cartola.estado == CartolaSubida.Estado.Procesada) "Procesada" else "Fallida"

    /** A failed import has no movements: nothing to count. */
    fun movimientos(cartola: CartolaSubida): String? =
        if (cartola.estado == CartolaSubida.Estado.Procesada) count(cartola.totalTransacciones) else null

    /** The server's reason, when it sent one worth showing. */
    fun motivo(cartola: CartolaSubida): String? =
        cartola.motivoFallo?.takeIf { cartola.estado == CartolaSubida.Estado.Fallida && it.isNotEmpty() }

    /** The consequence, named before the person confirms (catalog: "Confirmación obligatoria"). */
    fun confirmation(cartola: CartolaSubida): String {
        val origin = "${banco(cartola)} (${Format.shortDate(cartola.fecha)})"
        if (cartola.estado != CartolaSubida.Estado.Procesada) return "Se eliminará esta cartola fallida de $origin."
        val count = cartola.totalTransacciones
        val verb = if (count == 1) "eliminará" else "eliminarán"
        return "Se $verb ${count(count)} de $origin. Esta acción no se puede deshacer."
    }

    fun rowLabel(cartola: CartolaSubida): String {
        val parts = listOfNotNull(banco(cartola), cartola.nombreArchivo, Format.shortDate(cartola.fecha), estado(cartola), movimientos(cartola))
        val label = parts.joinToString(". ")
        return motivo(cartola)?.let { "$label. Motivo: $it" } ?: label
    }

    /** The row's delete button: it names which import, since every row has one. */
    fun deleteLabel(cartola: CartolaSubida): String = "Eliminar cartola de ${banco(cartola)}, ${Format.shortDate(cartola.fecha)}"

    fun dateAndCount(cartola: CartolaSubida): String {
        val date = Format.shortDate(cartola.fecha)
        return movimientos(cartola)?.let { "$date · $it" } ?: date
    }

    private fun count(count: Int): String = if (count == 1) "1 movimiento" else "$count movimientos"
}
