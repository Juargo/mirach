package app.mirachbudget.android.features.resumen

import app.mirachbudget.android.core.design.BucketColors
import app.mirachbudget.android.core.design.MirachCopy
import app.mirachbudget.android.core.formatting.Format
import app.mirachbudget.android.core.networking.Bucket
import app.mirachbudget.android.core.networking.BucketResumen
import app.mirachbudget.android.core.networking.ResumenMes

/** Labels come from the design tokens, never hand-typed, so the 30% bucket cannot drift from its official name. */
val Bucket.label: String
    get() = when (this) {
        Bucket.Necesidades -> MirachCopy.Bucket.necesidades
        Bucket.Deseos -> MirachCopy.Bucket.deseos
        Bucket.Ahorro -> MirachCopy.Bucket.ahorro
    }

/** A fill (the swatch and the chart slice), never a text color. */
fun BucketColors.fill(bucket: Bucket) = when (bucket) {
    Bucket.Necesidades -> necesidades
    Bucket.Deseos -> deseos
    Bucket.Ahorro -> ahorro
}

/** What TalkBack reads for a bucket row, with the same sign logic as the visible figure. */
fun BucketResumen.accessibilityLabel(): String {
    val share = porcentajeBp?.let { "${Format.percent(it)} del ingreso" } ?: "sin porcentaje del ingreso"
    return "${bucket.label}. ${Format.spokenExpense(total)}, $share. Meta ${Format.percent(metaBp)}"
}

fun ResumenMes.incomeAccessibilityLabel(): String = "${MirachCopy.Bucket.ingreso}. ${Format.spokenIncome(totalIngreso)}"

/** The chart is read as one summary; the legend rows are the accessible way to each bucket. */
fun chartDescription(buckets: List<BucketResumen>): String =
    buckets.joinToString(", ") { "${it.bucket.label} ${Format.money(maxOf(it.total, 0))}" }

/** The distribution chart only makes sense when something was spent. */
fun ResumenMes.hasSpending(): Boolean = buckets.any { it.total > 0 }

/** Degrees of each slice, proportional to the totals; negative totals draw nothing. Drawing only: no figure is shown from these. */
fun sweepAngles(totals: List<Long>): List<Float> {
    val positives = totals.map { maxOf(it, 0L).toDouble() }
    val sum = positives.sum()
    if (sum == 0.0) return positives.map { 0f }
    return positives.map { (it / sum * 360.0).toFloat() }
}
