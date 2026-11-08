package app.mirachbudget.android.features.detallebucket

import app.mirachbudget.android.core.formatting.Format
import app.mirachbudget.android.core.networking.Bucket
import app.mirachbudget.android.core.networking.BucketDetalle
import app.mirachbudget.android.core.networking.CategoriaCatalogo
import app.mirachbudget.android.core.networking.GrupoCategoria
import app.mirachbudget.android.core.networking.MovimientoBucket
import app.mirachbudget.android.core.networking.Parecidos
import app.mirachbudget.android.core.networking.PatronExistente
import app.mirachbudget.android.core.networking.Periodo
import app.mirachbudget.android.core.networking.Reclasificacion
import app.mirachbudget.android.features.resumen.label

/**
 * The words of "Detalle de bucket", verbatim from iOS (`DetalleBucketView`,
 * `DetalleBucketViewModel` and `DetalleBucketPresentation`): counts, notices and what TalkBack reads,
 * with the same sign logic as the figures on screen (see [Format]).
 */
object DetalleBucketMessages {
    const val LOADING = "Cargando movimientos…"
    const val RETRY = "Reintentar"
    const val LOADING_CATEGORIES = "Cargando categorías…"
    const val CATALOG_FAILED = "No pudimos cargar las categorías."
    const val SAVE = "Guardar"
    const val BUCKET_CHANGE_TITLE = "Cambiar de grupo"
    const val CANCEL = "Cancelar"
    const val CONFIRM = "Confirmar"
    const val ROW_HINT = "Cambiar de categoría"
    const val GROUP_HINT = "Abrir la categoría"
    const val CHECKED = "Marcado"
    const val UNCHECKED = "Sin marcar"

    const val REFRESH_FAILED = "No se pudo actualizar la lista."
    const val RELOAD_AFTER_MOVE_FAILED = "Se movió, pero no pudimos actualizar la lista. Desliza hacia abajo para actualizar."
    const val CATEGORY_GONE = "Esa categoría ya no existe. Elige otra."
    const val MOVEMENT_GONE = "Ese movimiento ya no existe."
    const val MOVE_FAILED_CONNECTION = "No pudimos mover el movimiento. Revisa tu conexión e inténtalo de nuevo."
    const val MOVE_FAILED = "No pudimos mover el movimiento. Inténtalo de nuevo."

    fun loadFailure(failure: DetalleBucketViewModel.Failure): String = when (failure) {
        DetalleBucketViewModel.Failure.Connection -> "Problema de conexión. Revisa tu conexión e inténtalo de nuevo."
        DetalleBucketViewModel.Failure.Server -> "No pudimos cargar los movimientos. Inténtalo de nuevo en unos segundos."
    }

    fun empty(periodo: Periodo): String = "Sin movimientos en ${Format.month(periodo)}"

    fun share(porcentajeBp: Int?): String = "${Format.percent(porcentajeBp)} del ingreso"

    fun meta(metaBp: Int): String = "Meta: ${Format.percent(metaBp)}"

    fun movements(count: Int): String = if (count == 1) "1 movimiento" else "$count movimientos"

    fun categories(count: Int): String = if (count == 1) "1 categoría" else "$count categorías"

    /** «3 movimientos · 2 categorías», under the bucket's total. */
    fun counts(detalle: BucketDetalle): String = "${movements(detalle.totalTransacciones)} · ${categories(detalle.totalCategorias)}"

    /** «5 sep · Banco de Chile». */
    fun rowSubtitle(movement: MovimientoBucket): String = "${Format.shortDate(movement.fecha)} · ${movement.origen}"

    /** The sheet's summary under the description: «5 sep · -$4.500». */
    fun sheetDetail(movement: MovimientoBucket): String = "${Format.shortDate(movement.fecha)} · ${Format.expense(movement.monto)}"

    fun headerLabel(detalle: BucketDetalle): String {
        val share = detalle.porcentajeBp?.let { share(it) } ?: "sin porcentaje del ingreso"
        val parts = mutableListOf(detalle.bucket.label, Format.spokenExpense(detalle.total), share)
        detalle.metaBp?.let { parts += "Meta ${Format.percent(it)}" }
        parts += movements(detalle.totalTransacciones)
        parts += categories(detalle.totalCategorias)
        return parts.joinToString(". ")
    }

    fun groupLabel(group: GrupoCategoria): String = "${group.nombre}. ${movements(group.conteo)}. ${Format.spokenExpense(group.subtotal)}"

    fun rowLabel(movement: MovimientoBucket): String =
        "${movement.descripcion}. ${Format.spokenExpense(movement.monto)}. ${Format.shortDate(movement.fecha)}. ${movement.origen}"

    /** «Este movimiento pasará de Gustos a Necesidades y cambiará el cálculo del mes.» */
    fun bucketChangeMessage(from: Bucket, to: Bucket): String =
        "Este movimiento pasará de ${from.label} a ${to.label} y cambiará el cálculo del mes."

    /** What «Guardar» does, or why it cannot yet. */
    fun saveHint(selection: CategoriaCatalogo?): String =
        selection?.let { "Mueve el movimiento a ${it.nombre}" } ?: "Elige una categoría primero"

    // --- apply to similar movements (CLA-03, Figma 09)

    /** «Aplicar a “netflix”». */
    fun applyTitle(patron: String): String = "Aplicar a “$patron”"

    /** How many OTHER movements of the month follow, and the next statements always do. */
    fun applySubtitle(total: Int): String = when (total) {
        0 -> "Los próximos que lleguen"
        1 -> "1 movimiento más y los próximos que lleguen"
        else -> "$total movimientos más y los próximos que lleguen"
    }

    /** The text already lives in another category: saving moves it here (CLA-17). */
    fun applyElsewhere(existente: PatronExistente?, categoriaId: String): String? =
        existente?.takeIf { it.categoriaId != categoriaId }?.let { "Ya está en ${it.categoria}: se moverá aquí." }

    /** The checkbox as TalkBack reads it: title, subtitle and the move, as one sentence. */
    fun applyLabel(parecidos: Parecidos, categoriaId: String): String {
        val parts = mutableListOf(applyTitle(parecidos.patron.orEmpty()), applySubtitle(parecidos.total))
        applyElsewhere(parecidos.existente, categoriaId)?.let { parts += it.dropLast(1) }
        return parts.joinToString(". ") + "."
    }

    /** «Movida a Gustos · Ropa», plus « · 3 movidos» when similar movements moved too. */
    fun movedAnnouncement(result: Reclasificacion): String {
        val base = "Movida a ${result.bucket.label} · ${result.categoriaNombre}"
        return if (result.movidos > 0) "$base · ${result.movidos} movidos" else base
    }
}
