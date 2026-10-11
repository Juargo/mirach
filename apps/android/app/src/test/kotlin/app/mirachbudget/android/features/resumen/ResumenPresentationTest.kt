package app.mirachbudget.android.features.resumen

import app.mirachbudget.android.core.networking.Bucket
import app.mirachbudget.android.features.resumen.ResumenSamples.mes
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** What TalkBack reads, and the chart's geometry, as pure functions. */
class ResumenPresentationTest {
    @Test
    fun bucketLabelsComeFromTheDesignTokens() {
        assertEquals(listOf("Necesidades", "Deseos", "Ahorro"), Bucket.entries.map { it.label })
    }

    @Test
    fun aBucketRowIsReadWithItsSpendShareAndTarget() {
        val item = mes().buckets[0]

        assertEquals("Necesidades. Gasto de $450.000, 45% del ingreso. Meta 50%", item.accessibilityLabel())
    }

    @Test
    fun aBucketWithoutIncomeSaysSoInsteadOfInventingAShare() {
        val item = mes(sinIngreso = true).buckets[1]

        assertEquals("Deseos. Gasto de $305.000, sin porcentaje del ingreso. Meta 30%", item.accessibilityLabel())
    }

    @Test
    fun aNegativeTotalIsARefundNotSpend() {
        val item = mes(totals = listOf(-2_000, 0, 0)).buckets[0]

        assertTrue(item.accessibilityLabel().startsWith("Necesidades. Reembolso neto de $2.000"))
    }

    @Test
    fun theIncomeCardIsReadWithTheSameSignLogicAsTheFigure() {
        assertEquals("Ingreso. Ingreso de $1.000.000", mes().incomeAccessibilityLabel())
        assertEquals("Ingreso. Sin ingreso", mes(ingreso = 0, sinIngreso = true).incomeAccessibilityLabel())
    }

    @Test
    fun theChartIsReadAsOneSummaryWithoutNegativeSlices() {
        val buckets = mes(totals = listOf(450_000, -10, 0)).buckets

        assertEquals("Necesidades $450.000, Deseos $0, Ahorro $0", chartDescription(buckets))
    }

    @Test
    fun theChartShowsOnlyWhenThereIsSpend() {
        assertTrue(mes().hasSpending())
        assertFalse(mes(totals = listOf(0, 0, 0)).hasSpending())
        assertFalse(mes(totals = listOf(-5, 0, 0)).hasSpending())
    }

    @Test
    fun sweepsAreProportionalToTheTotalsAndIgnoreNegatives() {
        assertEquals(listOf(90f, 90f, 180f), sweepAngles(listOf(1, 1, 2)))
        assertEquals(listOf(360f, 0f, 0f), sweepAngles(listOf(5, -3, 0)))
        assertEquals(listOf(0f, 0f, 0f), sweepAngles(listOf(0, 0, 0)))
    }
}
