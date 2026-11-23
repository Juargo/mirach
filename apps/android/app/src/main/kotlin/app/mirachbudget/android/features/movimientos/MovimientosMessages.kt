package app.mirachbudget.android.features.movimientos

import app.mirachbudget.android.core.formatting.Format
import app.mirachbudget.android.core.networking.Bucket
import app.mirachbudget.android.core.networking.BucketDetalle
import app.mirachbudget.android.core.networking.MovimientoBucket
import app.mirachbudget.android.features.resumen.label

/**
 * The words of the «Movimientos» tab, in the neutral Spanish the spec quotes (the same on iOS). What the
 * bucket detail already says (loading, retry, load errors, «N movimientos») is read from
 * `DetalleBucketMessages`, not repeated here. Amounts have no sign: the panes show money, not a direction.
 */
object MovimientosMessages {
    const val TITLE = "Movimientos"
    const val EMPTY = "Sin movimientos"
    const val MOVE = "Mover"
    const val UNDO = "Deshacer"

    /** «$569.400 · 52%»: the bucket's total and its share of the income, nothing else; «—» without a share. */
    fun paneHeader(detalle: BucketDetalle): String = "${Format.money(detalle.total)} · ${Format.percent(detalle.porcentajeBp)}"

    /** What TalkBack reads for a pane's title: «Gustos. $569.400 · 52%». */
    fun paneLabel(detalle: BucketDetalle): String = "${detalle.bucket.label}. ${paneHeader(detalle)}"

    /** «Movido a Gustos · Ropa». */
    fun moved(bucket: Bucket, categoria: String): String = "Movido a ${bucket.label} · $categoria"

    /** «Mover CAFE CENTRAL»: the button's spoken name, so the row's buttons are told apart. */
    fun moveLabel(movement: MovimientoBucket): String = "$MOVE ${movement.descripcion}"

    /** A movement as TalkBack reads it: description, amount and date. */
    fun movementLabel(movement: MovimientoBucket): String =
        "${movement.descripcion}. ${Format.money(movement.monto)}. ${Format.shortDate(movement.fecha)}"
}
