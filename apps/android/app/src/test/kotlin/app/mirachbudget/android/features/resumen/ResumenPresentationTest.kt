package app.mirachbudget.android.features.resumen

import app.mirachbudget.android.core.networking.Bucket
import app.mirachbudget.android.core.networking.BucketResumen
import app.mirachbudget.android.core.networking.EstadoSemaforo
import app.mirachbudget.android.core.networking.FuenteIngreso
import app.mirachbudget.android.features.resumen.ResumenSamples.mes
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** What TalkBack reads, and the chart's geometry, as pure functions. */
class ResumenPresentationTest {
    @Test
    fun bucketLabelsComeFromTheDesignTokens() {
        assertEquals(listOf("Necesidades", "Gustos", "Ahorro"), Bucket.entries.map { it.label })
    }

    @Test
    fun aBucketRowIsReadWithItsSpendShareAndTarget() {
        val item = mes().buckets[0]

        assertEquals("Necesidades. Gasto de $450.000, 45% del ingreso. Meta 50%", item.accessibilityLabel())
    }

    @Test
    fun aBucketWithoutIncomeSaysSoInsteadOfInventingAShare() {
        val item = mes(sinIngreso = true).buckets[1]

        assertEquals("Gustos. Gasto de $305.000, sin porcentaje del ingreso. Meta 30%", item.accessibilityLabel())
    }

    @Test
    fun aNegativeTotalIsARefundNotSpend() {
        val item = mes(totals = listOf(-2_000, 0, 0)).buckets[0]

        assertTrue(item.accessibilityLabel().startsWith("Necesidades. Reembolso neto de $2.000"))
    }

    @Test
    fun aBucketRowThatOpensItsMovementsSaysSoAsIos() {
        assertEquals("Ver los movimientos", BUCKET_ROW_HINT)
    }

    @Test
    fun theMonthVerdictIsTheHeadlineAndIsAbsentWithoutState() {
        assertEquals("Dentro de la meta", monthVerdict(EstadoSemaforo.Verde))
        assertEquals("Cerca del límite", monthVerdict(EstadoSemaforo.Amarillo))
        assertEquals("Fuera de la meta", monthVerdict(EstadoSemaforo.Rojo))
        assertNull(monthVerdict(null))
    }

    @Test
    fun theBarCaptionReadsRealShareOfTargetAndAmount() {
        val item = BucketResumen(Bucket.Necesidades, total = 700_000, porcentajeBp = 5_600, metaBp = 5_000, estado = null)

        assertEquals("56% de 50% · $700.000", item.barCaption())
    }

    @Test
    fun theBarCaptionWithoutIncomeShowsADashForTheShare() {
        val item = mes(sinIngreso = true).buckets[1]

        assertEquals("— de 30% · $305.000", item.barCaption())
    }

    @Test
    fun aBarIsReadWithItsStateWordWhenItHasOne() {
        val item = mes().buckets[0].copy(estado = EstadoSemaforo.Amarillo)

        assertEquals("Necesidades. Gasto de $450.000, 45% del ingreso. Meta 50%. Estado: Cerca", item.accessibilityLabel())
    }

    @Test
    fun theIncomeRowShowsTheAmountAndWhereItComesFrom() {
        assertEquals("$1.000.000 · declarado", mes().incomeRowText())
        assertEquals("$1.000.000 · detectado", mes().copy(fuenteIngreso = FuenteIngreso.Detectado).incomeRowText())
    }

    @Test
    fun theIncomeRowIsReadWithTheSameSignLogicAsTheFigureAndItsSource() {
        assertEquals("Ingresos del mes. Ingreso de $1.000.000, declarado", mes().incomeRowDescription())
        val negative = mes(ingreso = -5_000).copy(fuenteIngreso = FuenteIngreso.Detectado)
        assertEquals("Ingresos del mes. Ajuste negativo de $5.000, detectado", negative.incomeRowDescription())
    }

    @Test
    fun theLegendNamesBothRings() {
        assertEquals("Anillo de afuera: tu mes. Anillo de adentro: tu meta.", DONUT_LEGEND)
    }

    @Test
    fun theIncomeRowLabelIsTheDesignCopy() {
        assertEquals("Ingresos del mes", INCOME_LABEL)
    }
}
