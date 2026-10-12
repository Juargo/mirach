package app.mirachbudget.android.core.networking

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Money on the wire is a decimal string; the app keeps whole pesos and never rounds. */
class MoneyTest {
    @Test
    fun parsesWholePesosExactly() {
        assertEquals(0L, Money.pesos("0"))
        assertEquals(450_000L, Money.pesos("450000"))
        assertEquals(-1_500L, Money.pesos("-1500"))
        assertEquals(9_007_199_254_740_993L, Money.pesos("9007199254740993"))
        assertEquals(Long.MIN_VALUE, Money.pesos("-9223372036854775808"))
    }

    @Test
    fun toleratesAFractionMadeOnlyOfZeros() {
        assertEquals(12L, Money.pesos("12.00"))
        assertEquals(-12L, Money.pesos("-12.0"))
    }

    @Test
    fun refusesAnythingElseInsteadOfRounding() {
        listOf("", "-", "12,5", "12.5", "12.", ".5", "1e3", " 12", "12 ", "+12", "١٢", "9223372036854775808", "--1")
            .forEach { assertNull("'$it' must be refused", Money.pesos(it)) }
    }
}
