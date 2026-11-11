package app.mirachbudget.android.features.resumen

import app.mirachbudget.android.core.design.BucketColors
import app.mirachbudget.android.core.design.MirachCopy
import app.mirachbudget.android.core.design.word
import app.mirachbudget.android.core.formatting.Format
import app.mirachbudget.android.core.networking.Bucket
import app.mirachbudget.android.core.networking.BucketResumen
import app.mirachbudget.android.core.networking.EstadoSemaforo
import app.mirachbudget.android.core.networking.FuenteIngreso
import app.mirachbudget.android.core.networking.ResumenMes

/** Labels come from the design tokens, never hand-typed, so the 30% bucket cannot drift from its official name. */
val Bucket.label: String
    get() = when (this) {
        Bucket.Necesidades -> MirachCopy.Bucket.necesidades
        Bucket.Deseos -> MirachCopy.Bucket.gustos
        Bucket.Ahorro -> MirachCopy.Bucket.ahorro
    }

/** A fill (the swatch and the chart slice), never a text color. */
fun BucketColors.fill(bucket: Bucket) = when (bucket) {
    Bucket.Necesidades -> necesidades
    Bucket.Deseos -> gustos
    Bucket.Ahorro -> ahorro
}

/** What TalkBack reads for a bucket row, with the same sign logic as the visible figure. */
fun BucketResumen.accessibilityLabel(): String {
    val share = porcentajeBp?.let { "${Format.percent(it)} del ingreso" } ?: "sin porcentaje del ingreso"
    val state = estado?.let { ". Estado: ${it.word}" } ?: ""
    return "${bucket.label}. ${Format.spokenExpense(total)}, $share. Meta ${Format.percent(metaBp)}$state"
}

/** The month verdict, the headline of the Inicio. Null when the API has no state for the month. */
fun monthVerdict(estado: EstadoSemaforo?): String? = when (estado) {
    EstadoSemaforo.Verde -> "Dentro de la meta"
    EstadoSemaforo.Amarillo -> "Cerca del límite"
    EstadoSemaforo.Rojo -> "Fuera de la meta"
    null -> null
}

/** «56% de 50% · $700.000»: real share, target, amount spent. */
fun BucketResumen.barCaption(): String = "${Format.percent(porcentajeBp)} de ${Format.percent(metaBp)} · ${Format.money(total)}"

const val INCOME_LABEL = "Ingresos del mes"

const val DONUT_LEGEND = "Anillo de afuera: tu mes. Anillo de adentro: tu meta."

private val FuenteIngreso.word: String
    get() = when (this) {
        FuenteIngreso.Declarado -> "declarado"
        FuenteIngreso.Detectado -> "detectado"
    }

/** «$1.250.000 · declarado». */
fun ResumenMes.incomeRowText(): String = "${Format.money(totalIngreso)} · ${fuenteIngreso.word}"

/** What TalkBack reads for the income row; a negative amount is money going out, never "income". */
fun ResumenMes.incomeRowDescription(): String = "$INCOME_LABEL. ${Format.spokenIncome(totalIngreso)}, ${fuenteIngreso.word}"
