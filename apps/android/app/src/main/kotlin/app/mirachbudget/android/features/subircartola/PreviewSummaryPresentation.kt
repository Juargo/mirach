package app.mirachbudget.android.features.subircartola

import app.mirachbudget.android.core.formatting.Format
import app.mirachbudget.android.core.networking.CartolaPreview
import app.mirachbudget.android.core.networking.CartolaRow
import app.mirachbudget.android.core.networking.ClasificacionPreview
import app.mirachbudget.android.features.resumen.label

/**
 * Screen 04's classification accordion (bucket → category → movement): the texts and the row lookups over
 * `CartolaPreview.clasificacion`. Pure, so it is tested without Compose. The counts and totals come from the
 * server; nothing is summed here.
 */
internal object PreviewSummaryPresentation {
    /** «N movimientos quedaron en Desconocido», or that everything was classified. */
    fun unknownsMessage(clasificacion: ClasificacionPreview): String =
        if (clasificacion.desconocidos == 0) SubirCartolaMessages.ALL_CLASSIFIED
        else SubirCartolaMessages.unknowns(clasificacion.desconocidos)

    /** With unknown rows, reviewing is the recommended action, so its button goes first and filled. */
    fun reviewIsPrimary(clasificacion: ClasificacionPreview): Boolean = clasificacion.desconocidos > 0

    fun countText(count: Int): String = SubirCartolaMessages.movements(count)

    fun title(group: ClasificacionPreview.BucketGroup): String = group.bucket.label

    /** TalkBack reads a header as one element. */
    fun spokenSummary(group: ClasificacionPreview.BucketGroup): String =
        "${title(group)}. ${countText(group.cantidad)}. ${Format.spokenExpense(group.total)}"

    fun spokenSummary(ingresos: ClasificacionPreview.Ingresos): String =
        "${SubirCartolaMessages.INCOMES_TITLE}. ${countText(ingresos.cantidad)}. ${Format.spokenIncome(ingresos.total)}"

    fun spokenSummary(categoria: ClasificacionPreview.Categoria): String =
        "${categoria.nombre}. ${countText(categoria.cantidad)}. ${Format.spokenExpense(categoria.total)}"

    /**
     * The movements of a category, by `rowIndex` ascending. An index the preview does not have (the server and
     * the rows disagree) is skipped rather than shown wrong.
     */
    fun rows(categoria: ClasificacionPreview.Categoria, preview: CartolaPreview): List<CartolaRow> {
        val byIndex = preview.filas.associateBy { it.rowIndex }
        return categoria.filas.sorted().mapNotNull { byIndex[it] }
    }

    /** The income rows the server counted in `ingresos`: not duplicated, `abono` only. */
    fun incomeRows(preview: CartolaPreview): List<CartolaRow> =
        preview.filas.filter { !it.esDuplicado && it.cargo == 0L && it.abono > 0L }
}
