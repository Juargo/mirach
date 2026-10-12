package app.mirachbudget.android.core.networking

/** A calendar month as the API names it (`AAAA-MM`). */
data class Periodo(val year: Int, val month: Int) {
    /** `AAAA-MM`, as the API expects it in `?periodo=`. */
    val apiValue: String get() = "%04d-%02d".format(year, month)

    companion object {
        /** `null` for anything that is not exactly `AAAA-MM` with a month from 01 to 12. */
        fun parse(text: String): Periodo? {
            val parts = text.split("-")
            if (parts.size != 2 || parts[0].length != 4 || parts[1].length != 2) return null
            if (!parts.all { part -> part.all { it in '0'..'9' } }) return null
            val month = parts[1].toInt()
            return if (month in 1..12) Periodo(parts[0].toInt(), month) else null
        }
    }
}

/** The three buckets of the 50/30/20 rule, in the catalog's fixed order. */
enum class Bucket(val apiName: String) {
    Necesidades("Necesidades"),
    Deseos("Deseos"),
    Ahorro("Ahorro"),
    ;

    companion object {
        fun fromApi(name: String): Bucket? = entries.firstOrNull { it.apiName == name }
    }
}

/** Traffic-light state. Kept in the model although the screen hides it (product decision, 2026-10-05). */
enum class EstadoSemaforo { Verde, Amarillo, Rojo }

data class BucketResumen(
    val bucket: Bucket,
    /** Spent in the bucket, whole pesos, as the API sends it (negative when refunds exceed spend). */
    val total: Long,
    /** Share of the income in basis points; null when the month has no income. */
    val porcentajeBp: Int?,
    /** Reference target in basis points (5000 = 50%). */
    val metaBp: Int,
    val estado: EstadoSemaforo?,
)

data class ResumenMes(
    val periodo: Periodo,
    val sinIngreso: Boolean,
    /** Whole pesos. */
    val totalIngreso: Long,
    val estadoGlobal: EstadoSemaforo?,
    /** Always the three buckets, in catalog order. */
    val buckets: List<BucketResumen>,
)
