package app.mirachbudget.android.core.design

import org.junit.Assert.assertEquals
import org.junit.Test

/** Bar geometry: the fill is the real share of income, the tick the target, both clamped to the track. */
class BucketBarTest {
    @Test
    fun fillAndTickAreFractionsOfTheTrack() {
        assertEquals(BarFractions(fill = 0.56f, tick = 0.5f), barFractions(shareBp = 5_600, targetBp = 5_000))
    }

    @Test
    fun aShareAboveTheIncomeFillsTheTrackButNoMore() {
        assertEquals(1f, barFractions(shareBp = 12_500, targetBp = 5_000).fill)
    }

    @Test
    fun aNegativeShareFillsNothing() {
        assertEquals(0f, barFractions(shareBp = -300, targetBp = 5_000).fill)
    }

    @Test
    fun aMonthWithoutIncomeHasNoFillButKeepsTheTick() {
        assertEquals(BarFractions(fill = 0f, tick = 0.3f), barFractions(shareBp = null, targetBp = 3_000))
    }

    @Test
    fun theTickIsClampedToo() {
        assertEquals(1f, barFractions(shareBp = 0, targetBp = 15_000).tick)
        assertEquals(0f, barFractions(shareBp = 0, targetBp = -1).tick)
    }
}
