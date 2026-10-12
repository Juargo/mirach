package app.mirachbudget.android.core.formatting

import app.mirachbudget.android.core.networking.Periodo

/**
 * Display rules of the catalog (`docs/catalogo/README.md`, "Reglas globales"). The app only
 * formats; hand-rolled on purpose so the output never depends on the device's locale and money
 * is exact integer arithmetic, never floating point. Same output as the iPhone `Format`.
 */
object Format {
    /** `$1.234.567`, `-$1.234`. */
    fun money(amount: Long): String = (if (amount < 0) "-" else "") + "$" + grouped(amount)

    /** Income with its sign: `+$1.000`; zero carries none. */
    fun income(amount: Long): String = signed(amount, positiveSign = "+", negativeSign = "-")

    /** Income as TalkBack should say it: a negative amount is money going out, never "income". */
    fun spokenIncome(amount: Long): String = when {
        amount == 0L -> "Sin ingreso"
        amount > 0 -> "Ingreso de $" + grouped(amount)
        else -> "Ajuste negativo de $" + grouped(amount)
    }

    /** A bucket's spend with its sign (the API sends spend positive); a negative total reads as money coming in. */
    fun expense(amount: Long): String = signed(amount, positiveSign = "-", negativeSign = "+")

    /** Spend as TalkBack should say it: a negative total (refunds exceed spend) is not spend. */
    fun spokenExpense(amount: Long): String = when {
        amount == 0L -> "Sin gasto"
        amount > 0 -> "Gasto de $" + grouped(amount)
        else -> "Reembolso neto de $" + grouped(amount)
    }

    /** Basis points as a percentage with a decimal comma: `3050` is `30,5%`, `5000` is `50%`. */
    fun percent(bp: Int): String {
        val magnitude = Math.abs(bp.toLong())
        val whole = magnitude / 100
        val cents = magnitude % 100
        val sign = if (bp < 0) "-" else ""
        val decimals = if (cents == 0L) "" else "," + "%02d".format(cents).trimEnd('0')
        return "$sign$whole$decimals%"
    }

    /** A missing percentage (month without income) is an em dash. */
    fun percent(bp: Int?): String = bp?.let(::percent) ?: "—"

    private val monthNames = listOf(
        "enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
    )

    /** `septiembre de 2026`. */
    fun month(periodo: Periodo): String = "${monthNames[periodo.month - 1]} de ${periodo.year}"

    /** `Septiembre de 2026`, for a title. */
    fun monthTitle(periodo: Periodo): String = month(periodo).replaceFirstChar { it.uppercase() }

    private fun signed(amount: Long, positiveSign: String, negativeSign: String): String = when {
        amount == 0L -> "$0"
        amount > 0 -> positiveSign + "$" + grouped(amount)
        else -> negativeSign + "$" + grouped(amount)
    }

    /** Digits of the magnitude (as text, so [Long.MIN_VALUE] is safe) grouped by thousands with dots. */
    private fun grouped(value: Long): String =
        value.toString().removePrefix("-").reversed().chunked(3).joinToString(".").reversed()
}
