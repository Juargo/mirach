package app.mirachbudget.android.core.networking

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PeriodoTest {
    @Test
    fun parsesAndPrintsTheApiValue() {
        assertEquals(Periodo(2026, 9), Periodo.parse("2026-09"))
        assertEquals("2026-09", Periodo(2026, 9).apiValue)
        assertEquals("2026-12", Periodo(2026, 12).apiValue)
    }

    @Test
    fun refusesMalformedPeriods() {
        listOf("2026-13", "2026-00", "2026-9", "26-09", "2026/09", "", "2026-09-01", "abcd-ef")
            .forEach { assertNull("'$it' must be refused", Periodo.parse(it)) }
    }
}
