package app.mirachbudget.android.core.networking

/**
 * Money on the wire is a decimal string (BigInt-safe, never a JSON number). The app keeps whole
 * pesos as [Long]. A fraction made only of zeros ("12.00") is tolerated; any other fraction is
 * refused: money is never rounded or truncated, a wrong figure is worse than an error.
 */
object Money {
    private val pattern = Regex("^(-?[0-9]+)(\\.0+)?$")

    /** `^-?[0-9]+(\.0+)?$` (ASCII digits only) converted exactly; null when malformed or beyond [Long]. */
    fun pesos(text: String): Long? = pattern.matchEntire(text)?.groupValues?.get(1)?.toLongOrNull()
}
