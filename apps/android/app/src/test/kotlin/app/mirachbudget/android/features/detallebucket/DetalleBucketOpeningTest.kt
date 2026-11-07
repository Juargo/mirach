package app.mirachbudget.android.features.detallebucket

import app.mirachbudget.android.core.networking.Bucket
import app.mirachbudget.android.core.networking.Periodo
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DetalleBucketOpeningTest {
    @Test
    fun anOpeningSurvivesItsSavedFormWithTheBucketAndTheMonthOfTheResumen() {
        val opening = DetalleBucketOpening(Bucket.Deseos, Periodo(2026, 9), id = "abc")

        assertEquals("Deseos|2026-09|abc", opening.saved)
        assertEquals(opening, DetalleBucketOpening.restore(opening.saved))
    }

    @Test
    fun aDamagedSavedFormOpensNothing() {
        assertNull(DetalleBucketOpening.restore("Deseos|2026-13|abc"))
        assertNull(DetalleBucketOpening.restore("Otro|2026-09|abc"))
        assertNull(DetalleBucketOpening.restore("Deseos|2026-09"))
    }
}
