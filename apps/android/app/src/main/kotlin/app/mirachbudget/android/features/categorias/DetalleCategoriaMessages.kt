package app.mirachbudget.android.features.categorias

import app.mirachbudget.android.core.formatting.Format
import app.mirachbudget.android.core.networking.CategoriaCatalogo
import app.mirachbudget.android.core.networking.CategoriaException
import app.mirachbudget.android.core.networking.CoincidenciaPatron
import app.mirachbudget.android.core.networking.PatronException
import app.mirachbudget.android.core.networking.Periodo
import app.mirachbudget.android.features.categorias.DetalleCategoriaViewModel.BucketChange
import app.mirachbudget.android.features.categorias.DetalleCategoriaViewModel.FieldErrors
import app.mirachbudget.android.features.categorias.DetalleCategoriaViewModel.PatternConflict
import app.mirachbudget.android.features.categorias.DetalleCategoriaViewModel.PatternErrors
import app.mirachbudget.android.features.resumen.label
import java.io.IOException

/**
 * The words of "Detalle de categoría" and its pattern sheet, verbatim from iOS
 * (`DetalleCategoriaView` and `DetalleCategoriaPresentation`): confirmations that name their
 * consequence and the message of every rejection the catalog names (the server's text only for a
 * code the app does not know).
 */
object DetalleCategoriaMessages {
    const val TITLE_FALLBACK = "Categoría"
    const val LOADING = "Cargando…"
    const val RETRY = "Reintentar"
    const val GONE = "Esa categoría ya no existe"
    const val BACK_TO_LIST = "Volver a Categorías"
    const val PROTECTED = "Esta categoría es del sistema y no se puede editar ni eliminar"
    const val SAVE = "Guardar"
    const val SAVING = "Guardando…"
    const val SAVED = "Categoría guardada"
    const val REFRESH_FAILED = "No se pudo actualizar la categoría."

    const val NAME = "Nombre"
    const val BUCKET = "Grupo"
    const val BUCKET_FOOTER = "Define cómo cuenta este gasto en tu 50/30/20; afecta todos los meses."
    const val ICON = "Ícono"
    const val NO_ICON = "Sin ícono"
    const val PATTERNS = "Patrones"
    const val PATTERNS_EMPTY = "Sin patrones: esta categoría solo se puede asignar manualmente."
    const val PATTERNS_FOOTER = "Se aplican a las próximas importaciones. Los movimientos ya importados no cambian."
    const val ADD_PATTERN = "Agregar patrón"
    const val EDIT_PATTERN_HINT = "Editar el patrón"
    const val DELETE_CATEGORY = "Eliminar categoría"
    const val DELETING = "Eliminando…"

    const val BUCKET_CHANGE_TITLE = "Cambiar de grupo"
    const val DELETE_TITLE = "¿Eliminar categoría?"
    const val DELETE_PATTERN_TITLE = "¿Eliminar este patrón?"
    const val DELETE_PATTERN_MESSAGE = "Los movimientos ya clasificados no cambian."
    const val DISCARD_TITLE = "¿Descartar los cambios?"
    const val DISCARD_MESSAGE = "Los cambios que no guardaste se perderán."
    const val DISCARD = "Descartar"
    const val KEEP_EDITING = "Seguir editando"
    const val CONFIRM = "Confirmar"
    const val DELETE = "Eliminar"
    const val CANCEL = "Cancelar"

    const val PATTERN_DELETED = "Patrón eliminado"
    const val PATTERN_GONE = "Ese patrón ya no existe"
    const val PATTERN_GONE_SAVE_HERE = "Ese patrón ya no existe. Puedes guardarlo aquí."

    // The pattern sheet (Figma 28 and 30).
    const val NEW_PATTERN = "Nuevo patrón"
    const val EDIT_PATTERN = "Editar patrón"
    const val PATTERN_TEXT = "Texto que aparece en la cartola"
    const val SAVE_PATTERN = "Guardar patrón"
    const val MOVE_MATCHES_NOTE = "Los que cambiaste a mano no se mueven. Las próximas cartolas usan el patrón siempre."
    const val CONFLICT_RULE = "Un texto solo puede estar en una categoría."

    fun loadFailure(failure: DetalleCategoriaViewModel.Failure): String = when (failure) {
        DetalleCategoriaViewModel.Failure.Connection -> "Problema de conexión. Revisa tu conexión e inténtalo de nuevo."
        DetalleCategoriaViewModel.Failure.Server -> "No pudimos cargar la categoría. Inténtalo de nuevo en unos segundos."
    }

    /** «12 movimientos en total», under the name. */
    fun nameFooter(category: CategoriaCatalogo): String = "${CategoriasMessages.movements(category.transaccionesCount)} en total"

    /** The pattern's type as a word; a type the app does not know shows as it came. */
    fun matchType(value: String): String = when (value) {
        "CONTAINS" -> "Contiene"
        "STARTS_WITH" -> "Empieza con"
        "REGEX" -> "Expresión regular"
        else -> value
    }

    fun patternRowLabel(matchType: String, patron: String) = "${matchType(matchType)}: $patron"

    fun deletePatternLabel(patron: String) = "Eliminar el patrón $patron"

    /** «12 movimientos pasarán de Gustos a Necesidades en todos los meses.» The zero case softens the sentence; it never skips the confirmation. */
    fun bucketChange(change: BucketChange): String = when (change.count) {
        0 -> "Esta categoría todavía no tiene movimientos. Pasará de ${change.from.label} a ${change.to.label}."
        1 -> "1 movimiento pasará de ${change.from.label} a ${change.to.label} en todos los meses."
        else -> "${change.count} movimientos pasarán de ${change.from.label} a ${change.to.label} en todos los meses."
    }

    /** Where the movements go and what else is removed with the category. */
    fun deletion(category: CategoriaCatalogo): String {
        val count = category.transaccionesCount
        val parts = mutableListOf(
            when (count) {
                0 -> "No tiene movimientos."
                1 -> "Su movimiento pasará a «Desconocido» de ${category.bucket.label}."
                else -> "Sus $count movimientos pasarán a «Desconocido» de ${category.bucket.label}."
            },
        )
        when (val patterns = category.patrones.size) {
            0 -> Unit
            1 -> parts += "También se eliminará su patrón."
            else -> parts += "También se eliminarán sus $patterns patrones."
        }
        parts += "Esta acción no se puede deshacer."
        return parts.joinToString(" ")
    }

    fun categoryErrors(error: Exception): FieldErrors = when (error) {
        is CategoriaException.InvalidName -> FieldErrors(name = "El nombre debe tener entre 1 y 40 caracteres")
        is CategoriaException.DuplicateName -> FieldErrors(name = "Ya tienes una categoría con ese nombre")
        is CategoriaException.BucketNotAssignable -> FieldErrors(bucket = "Elige un grupo: Necesidades, Gustos o Ahorro")
        is CategoriaException.InvalidIcon -> FieldErrors(icon = "Elige un ícono válido de la lista")
        is CategoriaException.IsInternal -> FieldErrors(general = PROTECTED)
        is CategoriaException.Rejected -> FieldErrors(general = error.serverMessage)
        is IOException -> FieldErrors(general = "No pudimos guardar los cambios. Revisa tu conexión e inténtalo de nuevo.")
        else -> FieldErrors(general = "No pudimos guardar los cambios. Inténtalo de nuevo.")
    }

    fun patternErrors(error: Exception): PatternErrors = when (error) {
        is PatronException.InvalidPattern -> PatternErrors(pattern = "Escribe un texto válido para el patrón (de 1 a 200 caracteres)")
        is PatronException.InvalidRegex -> PatternErrors(pattern = "Esa expresión regular no es válida")
        is PatronException.Duplicate, is PatronException.DuplicateOf -> PatternErrors(pattern = "Ya tienes un patrón con ese texto")
        is PatronException.InvalidMatchType -> PatternErrors(pattern = "Ese tipo de coincidencia no es válido")
        is PatronException.Rejected -> PatternErrors(general = error.serverMessage)
        is IOException -> PatternErrors(general = "No pudimos guardar el patrón. Revisa tu conexión e inténtalo de nuevo.")
        else -> PatternErrors(general = "No pudimos guardar el patrón. Inténtalo de nuevo.")
    }

    /** [what] is «la categoría» or «el patrón». */
    fun deleteFailure(error: Exception, what: String): String =
        if (error is IOException) "No pudimos eliminar $what. Revisa tu conexión e inténtalo de nuevo." else "No pudimos eliminar $what. Inténtalo de nuevo."

    // --- new pattern (CLA-15, Figma 28)

    /** «Coincide con 3 movimientos de octubre». */
    fun previewTitle(total: Int, periodo: Periodo): String = "Coincide con ${CategoriasMessages.movements(total)} de ${Format.monthName(periodo)}"

    /** «SUPER ACUENTA ÑUÑOA · 14 oct · -$32.400», with the same formatters as every list. */
    fun previewRow(row: CoincidenciaPatron): String = "${row.descripcion} · ${Format.shortDate(row.fecha)} · ${Format.expense(row.monto)}"

    /** The row as TalkBack reads it, with the spoken amount. */
    fun previewRowLabel(row: CoincidenciaPatron): String = "${row.descripcion}. ${Format.shortDate(row.fecha)}. ${Format.spokenExpense(row.monto)}"

    /** «Mover también estos 3 movimientos a Supermercado»; one movement reads in the singular. */
    fun moveMatchesTitle(total: Int, categoria: String): String =
        if (total == 1) "Mover también este movimiento a $categoria" else "Mover también estos $total movimientos a $categoria"

    /** «Patrón guardado», plus « · 3 movidos» when movements of the month moved with it. */
    fun patternSaved(movidos: Int): String = if (movidos > 0) "Patrón guardado · $movidos movidos" else "Patrón guardado"

    // --- a text of another category (CLA-17, Figma 30)

    fun conflictTitle(conflict: PatternConflict): String =
        "«${conflict.texto}» ya está en ${conflict.existente.categoria} (${conflict.existente.bucket.label})"

    /** What moving it here changes: the next movements count in this category's bucket. */
    fun conflictConsequence(conflict: PatternConflict, here: CategoriaCatalogo): String =
        "Si lo mueves aquí, los próximos movimientos con «${conflict.texto}» contarán como ${here.bucket.label.lowercase()}."

    fun moveHere(here: CategoriaCatalogo): String = "Moverlo a ${here.nombre} (${here.bucket.label})"
}
