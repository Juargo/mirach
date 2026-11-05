package app.mirachbudget.android.features.subircartola

import app.mirachbudget.android.core.formatting.Format
import app.mirachbudget.android.core.networking.Bucket
import app.mirachbudget.android.core.networking.CartolaRow
import app.mirachbudget.android.core.networking.NuevaCategoria
import app.mirachbudget.android.features.subircartola.SubirCartolaViewModel.PreviewRefresh

/**
 * Display rules of the "Subir cartola" screens that are not composables, so they can be unit
 * tested (port of the inline logic of iOS `ReviewView.swift` and `NewCategoryForm.swift`).
 */
internal object SubirCartolaDisplay {
    /** What the pattern field of the creation form may hold: the API takes 1 to 200 characters. */
    private const val MAX_PATTERN_LENGTH = 200

    /** One TalkBack element per row: description, amount, date and classification. */
    fun rowAccessibilityLabel(row: CartolaRow, detail: String): String =
        "${row.descripcion}. ${row.spokenAmount}. ${Format.shortDate(row.fecha)}. $detail"

    /** The second line of the category sheet's summary: «5 ene · -$25.990». */
    fun rowSummaryDetail(row: CartolaRow): String = "${Format.shortDate(row.fecha)} · ${row.amountText}"

    /** No catalog (reloading or failed) or a repeated preview running: nothing to choose from yet. */
    fun canEdit(row: CartolaRow, catalogLoaded: Boolean, refresh: PreviewRefresh): Boolean =
        row.isEditable && catalogLoaded && refresh != PreviewRefresh.Updating

    /** The pattern field starts with the row's description. */
    fun initialPattern(descripcion: String): String = descripcion.trim().take(MAX_PATTERN_LENGTH)

    fun canCreate(name: String, bucket: Bucket?, isCreating: Boolean): Boolean =
        name.isNotBlank() && bucket != null && !isCreating

    /** The review form offers no icon (only the Categorías screen does). */
    fun nuevaCategoria(name: String, bucket: Bucket, pattern: String): NuevaCategoria =
        NuevaCategoria(nombre = name.trim(), bucket = bucket, patron = pattern, icono = null)

    /** «cartola.pdf · 1,2 MB»; the size comes already formatted by the system. */
    fun fileLine(filename: String, size: String): String = "$filename · $size"
}
