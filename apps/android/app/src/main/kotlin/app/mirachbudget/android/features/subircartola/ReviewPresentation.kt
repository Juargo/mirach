package app.mirachbudget.android.features.subircartola

import app.mirachbudget.android.core.design.MirachCopy
import app.mirachbudget.android.core.formatting.Format
import app.mirachbudget.android.core.networking.Bucket
import app.mirachbudget.android.core.networking.CartolaRow
import app.mirachbudget.android.core.networking.CatalogoCategorias
import app.mirachbudget.android.features.resumen.label

/**
 * How the review shows a row: its classification and the grouping of the list. Pure functions of
 * the rows, the edits and the catalog (port of iOS `ReviewPresentation.swift`).
 */
object ReviewPresentation {
    data class Classification(val bucket: Bucket, val name: String) {
        /** «Necesidades · Supermercado». */
        val text: String get() = "${bucket.label} · $name"
    }

    data class Section(
        val id: String,
        val title: String,
        /** `null` for the incomes and the already loaded rows. */
        val bucket: Bucket?,
        val rows: List<CartolaRow>,
    )

    const val UNKNOWN_CATEGORY_NAME = "Desconocido"
    const val UNRESOLVED_CATEGORY_NAME = "Otra categoría"
    const val DUPLICATES_TITLE = "Ya cargados"
    const val INCOME_TITLE = MirachCopy.Bucket.ingreso

    /**
     * What the row shows: the person's choice if there is one, else what the server suggested.
     * A row with no suggestion is «Deseos · Desconocido» (the server's default).
     */
    fun classification(row: CartolaRow, edit: String?, catalog: CatalogoCategorias?): Classification {
        if (edit != null) return resolve(edit, row.sugerido?.bucket ?: Bucket.Deseos, catalog)
        val suggestion = row.sugerido ?: return Classification(Bucket.Deseos, UNKNOWN_CATEGORY_NAME)
        val id = suggestion.categoriaId ?: return Classification(suggestion.bucket, UNKNOWN_CATEGORY_NAME)
        return resolve(id, suggestion.bucket, catalog)
    }

    /** An id the catalog does not list (it changed since the preview) keeps the bucket. */
    private fun resolve(id: String, fallbackBucket: Bucket, catalog: CatalogoCategorias?): Classification {
        val category = catalog?.categoria(id) ?: return Classification(fallbackBucket, UNRESOLVED_CATEGORY_NAME)
        return Classification(category.bucket, category.nombre)
    }

    /**
     * Rows grouped by bucket and category (Necesidades, Deseos, Ahorro; categories in the catalog's
     * order), each group by `rowIndex`. Incomes and already loaded rows go last, apart: they
     * cannot be edited.
     */
    fun sections(rows: List<CartolaRow>, edits: Map<Int, String>, catalog: CatalogoCategorias?): List<Section> {
        val grouped = rows.filter { it.isEditable }.groupBy { classification(it, edits[it.rowIndex], catalog) }
        val ordered = grouped.keys.sortedWith(
            compareBy<Classification>({ it.bucket.ordinal }, { categoryPosition(it, catalog) }, { it.name }),
        )
        val sections = ordered.mapTo(mutableListOf()) { key ->
            Section(id = key.text, title = key.text, bucket = key.bucket, rows = grouped.getValue(key).sortedBy { it.rowIndex })
        }
        val incomes = rows.filter { !it.esDuplicado && it.esIngreso }.sortedBy { it.rowIndex }
        if (incomes.isNotEmpty()) sections += Section(id = "ingresos", title = INCOME_TITLE, bucket = null, rows = incomes)
        val loaded = rows.filter { it.esDuplicado }.sortedBy { it.rowIndex }
        if (loaded.isNotEmpty()) sections += Section(id = "duplicados", title = DUPLICATES_TITLE, bucket = null, rows = loaded)
        return sections
    }

    private fun categoryPosition(classification: Classification, catalog: CatalogoCategorias?): Int {
        val index = catalog?.categorias?.indexOfFirst {
            it.bucket == classification.bucket && it.nombre == classification.name
        } ?: -1
        return if (index < 0) Int.MAX_VALUE else index
    }

    /** What TalkBack adds after the row's description, amount and date. */
    fun rowDetail(row: CartolaRow, classification: Classification, isEdited: Boolean): String = when {
        row.esDuplicado -> "${SubirCartolaMessages.ALREADY_LOADED}, no se puede editar"
        row.esIngreso -> "$INCOME_TITLE, no se puede editar"
        else -> classification.text + if (isEdited) ", editada" else ""
    }
}

/**
 * The server's rule (commit Rule 2, IMP-21): a credit with no debit is always imported as «Ingreso»
 * with no category, and any edit for it is ignored.
 */
val CartolaRow.esIngreso: Boolean get() = abono > 0 && cargo == 0L

/** Only a new expense-like row can take a category. */
val CartolaRow.isEditable: Boolean get() = !esDuplicado && !esIngreso

/** `-$25.990` for an expense, `+$1.200.000` for an income. */
val CartolaRow.amountText: String get() = if (cargo != 0L) Format.expense(cargo) else Format.income(abono)

val CartolaRow.spokenAmount: String
    get() = when {
        cargo != 0L -> Format.spokenExpense(cargo)
        abono != 0L -> "Ingreso de ${Format.money(abono)}"
        else -> "Sin monto"
    }
