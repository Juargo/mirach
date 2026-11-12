package app.mirachbudget.android.core.design

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Angles are Compose's: 0 at three o'clock, growing clockwise, so the visible leading half runs
 * from 270 (top) through 180 (left) to 90 (bottom). Necesidades sits at the top.
 */
class HalfDonutTest {
    private val delta = 0.001f

    @Test
    fun segmentsSplitTheHalfByShareLeavingAGapOfOneAndAHalfDegrees() {
        val segments = donutSegments(listOf(5_000, 3_000, 2_000))

        // Slices of 90, 54 and 36 degrees; each loses 0.75 at both ends.
        assertEquals(180.75f, segments[0].startAngle, delta)
        assertEquals(88.5f, segments[0].sweepAngle, delta)
        assertEquals(126.75f, segments[1].startAngle, delta)
        assertEquals(52.5f, segments[1].sweepAngle, delta)
        assertEquals(90.75f, segments[2].startAngle, delta)
        assertEquals(34.5f, segments[2].sweepAngle, delta)
    }

    @Test
    fun aSegmentTooThinForItsPercentageIsDrawnWithoutLabel() {
        // 800 of 9450 basis points is a 15.2 degree slice, 13.7 after the gap: under the 16 a label needs.
        val segments = donutSegments(listOf(5_600, 3_050, 800))

        assertEquals(listOf(true, true, false), segments.map { it.showsLabel })
        assertEquals(listOf(true, true, true), donutSegments(listOf(5_000, 3_000, 2_000)).map { it.showsLabel })
    }

    @Test
    fun ringLabelsAreWholePercentages() {
        assertEquals(listOf("56%", "31%", "8%", "0%"), listOf(5_600, 3_050, 800, 49).map(::donutLabel))
    }

    @Test
    fun theGapBetweenNeighboursIsExactlyTheGapConstant() {
        val (necesidades, gustos) = donutSegments(listOf(5_000, 3_000, 2_000))

        assertEquals(1.5f, DONUT_GAP_DEGREES, 0f)
        assertEquals(DONUT_GAP_DEGREES, necesidades.startAngle - (gustos.startAngle + gustos.sweepAngle), delta)
    }

    @Test
    fun sharesOfAWholeLeaveTheUnspentPartEmpty() {
        // 20/10/10 of the income: 36, 18 and 18 degrees of the half; the other 108 stay empty.
        val segments = donutSegments(listOf(2_000, 1_000, 1_000), wholeBp = WHOLE_INCOME_BP)

        assertEquals(234.75f, segments[0].startAngle, delta)
        assertEquals(34.5f, segments[0].sweepAngle, delta)
        assertEquals(16.5f, segments[1].sweepAngle, delta)
        assertEquals(198.75f, segments[2].startAngle, delta)
        assertEquals(16.5f, segments[2].sweepAngle, delta)
    }

    @Test
    fun sharesOverTheWholeFillTheHalfInProportion() {
        val over = donutSegments(listOf(6_000, 3_000, 3_000), wholeBp = WHOLE_INCOME_BP)
        val exact = donutSegments(listOf(5_000, 2_500, 2_500), wholeBp = WHOLE_INCOME_BP)

        over.zip(exact).forEach { (a, b) ->
            assertEquals(b.startAngle, a.startAngle, delta)
            assertEquals(b.sweepAngle, a.sweepAngle, delta)
        }
        assertEquals(90.75f, over[2].startAngle, delta)
    }

    @Test
    fun sharesAreRelativeToTheirSumNotToTenThousand() {
        val over = donutSegments(listOf(6_000, 3_000, 3_000))
        val exact = donutSegments(listOf(5_000, 2_500, 2_500))

        over.zip(exact).forEach { (a, b) ->
            assertEquals(b.startAngle, a.startAngle, delta)
            assertEquals(b.sweepAngle, a.sweepAngle, delta)
        }
    }

    @Test
    fun aSumOfZeroDrawsNothing() {
        assertTrue(donutSegments(listOf(0, 0, 0)).isEmpty())
        assertTrue(donutSegments(listOf(null, null, null)).isEmpty())
        assertTrue(donutSegments(listOf(-500, 0, null)).isEmpty())
    }

    @Test
    fun aNegativeOrMissingShareIsASegmentWithoutSweep() {
        val segments = donutSegments(listOf(5_000, -200, null))

        assertEquals(3, segments.size)
        assertEquals(0f, segments[1].sweepAngle, 0f)
        assertEquals(0f, segments[2].sweepAngle, 0f)
        assertEquals(178.5f, segments[0].sweepAngle, delta)
    }

    @Test
    fun theLabelSitsAtTheMiddleOfTheSegment() {
        val segment = donutSegments(listOf(5_000, 3_000, 2_000))[0]

        assertEquals(225f, segment.midAngle, delta)
    }

    @Test
    fun theTargetRingUsesTheTargetsAsShares() {
        val segments = donutSegments(listOf(5_000, 3_000, 2_000))

        assertEquals(3, segments.size)
        assertEquals(270f - 0.75f, segments[0].startAngle + segments[0].sweepAngle, delta)
    }
}
